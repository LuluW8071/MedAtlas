import type { Filter, ObjectId } from 'mongodb';
import { z } from 'zod';

import { env } from '../config/env.js';
import { getDb } from './clients/mongo_client.js';

interface AppointmentDoc {
  _id: ObjectId;
  name: string;
  email: string;
  appointmentAt: number;
  durationMinutes: number;
  timezone: string;
  createdAt: number;
  status: 'scheduled' | 'cancelled';
}

const appointments = () => getDb().collection<AppointmentDoc>('appointments');

const timezone = env.appointmentTimezone;
const appointmentDurationMs = 30 * 60 * 1000;
const minimumLeadTimeMs = 60 * 60 * 1000;
const openingHour = 6;
const closingHour = 23;

type DateParts = { year: number; month: number; day: number };
type WallTime = DateParts & { hour: number; minute: number };

export interface AppointmentInput {
  name: string;
  email: string;
  appointmentDate: string;
  appointmentTime: string;
}

export interface AppointmentResult {
  ok: boolean;
  message: string;
  missingFields?: string[];
  appointmentAt?: string;
  appointmentEndsAt?: string;
  previousAppointmentAt?: string;
}

const emailSchema = z.string().trim().email().max(254);

function zonedParts(date: Date): DateParts & { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function timezoneOffsetMs(date: Date): number {
  const parts = zonedParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function wallTimeToDate(value: WallTime): Date {
  const guess = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute));
  return new Date(guess.getTime() - timezoneOffsetMs(guess));
}

function datePartsFromDate(date: Date): DateParts {
  const parts = zonedParts(date);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function addDays(value: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function parseDate(value: string, now: Date): DateParts | null {
  const normalized = value.trim().toLowerCase();
  const current = datePartsFromDate(now);
  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const result = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    const check = new Date(Date.UTC(result.year, result.month - 1, result.day));
    return check.getUTCFullYear() === result.year && check.getUTCMonth() + 1 === result.month && check.getUTCDate() === result.day
      ? result
      : null;
  }
  if (normalized === 'today') return current;
  if (normalized === 'tomorrow') return addDays(current, 1);
  if (normalized === 'day after tomorrow') return addDays(current, 2);
  if (normalized === 'next week') return addDays(current, 7);
  const inDays = normalized.match(/^in (\d+) days?$/);
  if (inDays) return addDays(current, Number(inDays[1]));

  const weekday = normalized.match(/^next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (!weekday) return null;
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentWeekday = new Date(Date.UTC(current.year, current.month - 1, current.day)).getUTCDay();
  return addDays(current, (weekdays.indexOf(weekday[1]) - currentWeekday + 7) % 7 || 7);
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'noon') return { hour: 12, minute: 0 };
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (match[3] && (hour < 1 || hour > 12)) return null;
  if (!match[3] && hour > 23) return null;
  if (minute > 59) return null;
  if (match[3] === 'pm' && hour < 12) hour += 12;
  if (match[3] === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

export function parseAppointmentDate(dateInput: string, timeInput: string, now = new Date()): Date | null {
  const date = parseDate(dateInput, now);
  const time = parseTime(timeInput);
  if (!date || !time) return null;
  return wallTimeToDate({ ...date, ...time });
}

function displayDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
}

function normalizedEmail(value: string): string | null {
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

function validateSlot(dateInput: string, timeInput: string, now: Date): { appointment?: Date; error?: string } {
  const appointment = parseAppointmentDate(dateInput, timeInput, now);
  if (!appointment) return { error: 'Invalid appointment date or time.' };

  const local = zonedParts(appointment);
  if (local.hour < openingHour || local.hour > closingHour || (local.hour === closingHour && local.minute > 0)) {
    return { error: 'Appointments are available from 6:00 AM through 11:00 PM.' };
  }
  if (appointment.getTime() < now.getTime() + minimumLeadTimeMs) {
    return { error: 'Appointment must start at least one hour from now.' };
  }
  return { appointment };
}

function overlappingAppointment(start: number, end: number, excludeId?: ObjectId): Filter<AppointmentDoc> {
  return {
    status: 'scheduled',
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    appointmentAt: { $lt: end },
    $expr: { $gt: [{ $add: ['$appointmentAt', { $multiply: ['$durationMinutes', 60_000] }] }, start] },
  };
}

/** The single scheduled appointment for an email, or the user-facing reason there is not exactly one. */
async function scheduledFor(email: string): Promise<{ appointment?: AppointmentDoc; error?: string }> {
  const matches = await appointments().find({ status: 'scheduled', email }).limit(2).toArray();
  if (matches.length === 0) return { error: 'No scheduled appointment was found for that email address.' };
  if (matches.length > 1) return { error: 'Multiple scheduled appointments match that email address. Please contact the clinic to resolve the ambiguity.' };
  return { appointment: matches[0] };
}

export async function bookAppointment(input: AppointmentInput, now = new Date()): Promise<AppointmentResult> {
  const email = normalizedEmail(input.email);
  if (!email) return { ok: false, message: 'A valid email address is required.' };
  const validation = validateSlot(input.appointmentDate, input.appointmentTime, now);
  if (!validation.appointment) return { ok: false, message: validation.error! };
  const appointment = validation.appointment;

  const start = appointment.getTime();
  const end = start + appointmentDurationMs;
  // shortcut: check-then-insert is not atomic on standalone Mongo; two simultaneous bookings of one slot can both pass, move to a replica set transaction if that matters.
  if (await appointments().findOne(overlappingAppointment(start, end), { projection: { _id: 1 } })) {
    return { ok: false, message: 'That time overlaps an existing appointment.' };
  }
  await appointments().insertOne({
    name: input.name.trim(),
    email,
    appointmentAt: start,
    durationMinutes: 30,
    timezone,
    createdAt: now.getTime(),
    status: 'scheduled',
  } as AppointmentDoc);

  return {
    ok: true,
    message: `Appointment booked for ${displayDate(appointment)} (${timezone}). Duration: 30 minutes.`,
    appointmentAt: appointment.toISOString(),
    appointmentEndsAt: new Date(end).toISOString(),
  };
}

export async function cancelAppointment(emailInput: string): Promise<AppointmentResult> {
  const email = normalizedEmail(emailInput);
  if (!email) return { ok: false, message: 'A valid email address is required.' };

  const { appointment, error } = await scheduledFor(email);
  if (!appointment) return { ok: false, message: error! };

  const updated = await appointments().updateOne({ _id: appointment._id, status: 'scheduled' }, { $set: { status: 'cancelled' } });
  if (updated.modifiedCount !== 1) return { ok: false, message: 'The appointment could not be cancelled.' };

  const appointmentDate = new Date(appointment.appointmentAt);
  return {
    ok: true,
    message: `Appointment for ${displayDate(appointmentDate)} (${appointment.timezone}) has been cancelled.`,
    previousAppointmentAt: appointmentDate.toISOString(),
  };
}

export async function rescheduleAppointment(
  emailInput: string,
  newDate: string,
  newTime: string,
  now = new Date(),
): Promise<AppointmentResult> {
  const email = normalizedEmail(emailInput);
  if (!email) return { ok: false, message: 'A valid email address is required.' };

  const found = await scheduledFor(email);
  if (!found.appointment) return { ok: false, message: found.error! };
  const appointment = found.appointment;

  const validation = validateSlot(newDate, newTime, now);
  if (!validation.appointment) return { ok: false, message: validation.error! };

  const nextAppointment = validation.appointment;
  const start = nextAppointment.getTime();
  const end = start + appointment.durationMinutes * 60 * 1000;
  if (await appointments().findOne(overlappingAppointment(start, end, appointment._id), { projection: { _id: 1 } })) {
    return { ok: false, message: 'The requested time overlaps an existing appointment. The original appointment remains scheduled.' };
  }

  const updated = await appointments().updateOne({ _id: appointment._id, status: 'scheduled' }, { $set: { appointmentAt: start } });
  if (updated.modifiedCount !== 1) return { ok: false, message: 'The appointment could not be rescheduled. The original appointment remains scheduled.' };

  const previousAppointment = new Date(appointment.appointmentAt);
  return {
    ok: true,
    message: `Appointment rescheduled from ${displayDate(previousAppointment)} to ${displayDate(nextAppointment)} (${appointment.timezone}). Duration: ${appointment.durationMinutes} minutes.`,
    previousAppointmentAt: previousAppointment.toISOString(),
    appointmentAt: nextAppointment.toISOString(),
    appointmentEndsAt: new Date(end).toISOString(),
  };
}
