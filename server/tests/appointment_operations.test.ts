import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

// Throwaway database so tests never touch real appointments; needs the local Mongo from docker compose.
process.env.MONGODB_DB_NAME = `medatlas_test_${randomUUID().slice(0, 8)}`;

after(async () => {
  const { getDb, mongoClient } = await import('../src/service/clients/mongo_client.js');
  await getDb().dropDatabase();
  await mongoClient.close();
});

async function rowsFor(email: string) {
  const { getDb } = await import('../src/service/clients/mongo_client.js');
  return getDb().collection<{ appointmentAt: number; status: string }>('appointments').find({ email: email.toLowerCase() }).toArray();
}

function futureDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function appointmentTime(): string {
  const hour = 6 + Math.floor(Math.random() * 17);
  const minute = Math.random() < 0.5 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function futureOffset(): number {
  return 7 + Math.floor(Math.random() * 40);
}

function patientName(): string {
  return `Patient ${randomUUID().slice(0, 8)}`;
}

function email(): string {
  return `case-${randomUUID()}@${randomUUID().slice(0, 12)}.test`;
}

test('cancellation changes one matching scheduled appointment and is not repeatable', async () => {
  const { bookAppointment, cancelAppointment } = await import('../src/service/appointments.js');
  const patientEmail = email();
  const booking = await bookAppointment({
    name: patientName(),
    email: patientEmail,
    appointmentDate: futureDate(futureOffset()),
    appointmentTime: appointmentTime(),
  });
  assert.equal(booking.ok, true);

  const cancellation = await cancelAppointment(patientEmail.toUpperCase());
  assert.equal(cancellation.ok, true);
  const [stored] = await rowsFor(patientEmail);
  assert.equal(stored?.status, 'cancelled');

  const repeated = await cancelAppointment(patientEmail);
  assert.equal(repeated.ok, false);
});

test('ambiguous email matches fail without changing appointments', async () => {
  const { bookAppointment, cancelAppointment, rescheduleAppointment } = await import('../src/service/appointments.js');
  const patientEmail = email();
  const original = [
    { appointmentDate: futureDate(futureOffset()), appointmentTime: appointmentTime() },
    { appointmentDate: futureDate(futureOffset() + 50), appointmentTime: appointmentTime() },
  ];
  for (const value of original) {
    assert.equal((await bookAppointment({ name: patientName(), email: patientEmail, ...value })).ok, true);
  }

  assert.equal((await cancelAppointment(patientEmail)).ok, false);
  assert.equal((await rescheduleAppointment(patientEmail, futureDate(futureOffset() + 100), appointmentTime())).ok, false);
  const matches = await rowsFor(patientEmail);
  assert.equal(matches.length, 2);
  assert.ok(matches.every(appointment => appointment.status === 'scheduled'));
});

test('rescheduling without a matching appointment does not create one', async () => {
  const { rescheduleAppointment } = await import('../src/service/appointments.js');
  const patientEmail = email();

  const result = await rescheduleAppointment(patientEmail, futureDate(futureOffset()), appointmentTime());
  assert.equal(result.ok, false);
  assert.equal((await rowsFor(patientEmail)).length, 0);
});

test('unavailable reschedule preserves original appointment and creates no replacement', async () => {
  const { bookAppointment, rescheduleAppointment } = await import('../src/service/appointments.js');
  const patientEmail = email();
  const blockingEmail = email();
  const originalInput = {
    appointmentDate: futureDate(futureOffset()),
    appointmentTime: appointmentTime(),
  };
  const target = {
    appointmentDate: futureDate(futureOffset() + 50),
    appointmentTime: appointmentTime(),
  };
  const original = await bookAppointment({ name: patientName(), email: patientEmail, ...originalInput });
  const blocking = await bookAppointment({ name: patientName(), email: blockingEmail, ...target });
  assert.equal(original.ok, true);
  assert.equal(blocking.ok, true);

  const result = await rescheduleAppointment(patientEmail, target.appointmentDate, target.appointmentTime);
  assert.equal(result.ok, false);

  const rows = await rowsFor(patientEmail);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.appointmentAt, Date.parse(original.appointmentAt!));
  assert.equal(rows[0]?.status, 'scheduled');
});

test('successful reschedule updates matching appointment in place', async () => {
  const { bookAppointment, rescheduleAppointment, parseAppointmentDate } = await import('../src/service/appointments.js');
  const patientEmail = email();
  const original = await bookAppointment({
    name: patientName(),
    email: patientEmail,
    appointmentDate: futureDate(futureOffset()),
    appointmentTime: appointmentTime(),
  });
  assert.equal(original.ok, true);

  const newDate = futureDate(futureOffset() + 50);
  const newTime = appointmentTime();
  const result = await rescheduleAppointment(patientEmail, newDate, newTime);
  assert.equal(result.ok, true);
  assert.equal(result.previousAppointmentAt, original.appointmentAt);
  assert.equal(result.appointmentAt, parseAppointmentDate(newDate, newTime)?.toISOString());

  const rows = await rowsFor(patientEmail);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.appointmentAt, Date.parse(result.appointmentAt!));
});
