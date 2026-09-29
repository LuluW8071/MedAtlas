import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAppointmentDate } from '../src/service/appointments.js';

const now = new Date('2026-09-28T04:00:00.000Z');

test('resolves next week as seven calendar days in appointment timezone', () => {
  const appointment = parseAppointmentDate('next week', '10:00 AM', now);

  assert.ok(appointment);
  assert.equal(appointment.toISOString(), '2026-10-05T04:15:00.000Z');
});

test('resolves relative dates and 12-hour times', () => {
  const appointment = parseAppointmentDate('day after tomorrow', '9:30 PM', now);

  assert.ok(appointment);
  assert.equal(appointment.toISOString(), '2026-09-30T15:45:00.000Z');
});

test('rejects invalid calendar dates and times', () => {
  assert.equal(parseAppointmentDate('2026-02-31', '10:00 AM', now), null);
  assert.equal(parseAppointmentDate('tomorrow', '25:00', now), null);
});
