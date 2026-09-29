import { and, gt, lt, sql } from 'drizzle-orm';

import { env } from '../config/env.js';
import { appointmentsDb } from '../db/client.js';
import { appointments } from '../db/schema.js';

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
  appointmentAt?: string;
  appointmentEndsAt?: string;
}

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

export function bookAppointment(input: AppointmentInput, now = new Date()): AppointmentResult {
  const appointment = parseAppointmentDate(input.appointmentDate, input.appointmentTime, now);
  if (!appointment) return { ok: false, message: 'Invalid appointment date or time.' };

  const local = zonedParts(appointment);
  if (local.hour < openingHour || local.hour > closingHour || (local.hour === closingHour && local.minute > 0)) {
    return { ok: false, message: 'Appointments are available from 6:00 AM through 11:00 PM.' };
  }
  if (appointment.getTime() < now.getTime() + minimumLeadTimeMs) {
    return { ok: false, message: 'Appointment must start at least one hour from now.' };
  }

  const start = appointment.getTime();
  const end = start + appointmentDurationMs;
  const booked = appointmentsDb.transaction(tx => {
    const conflict = tx.select({ id: appointments.id })
      .from(appointments)
      .where(and(
        lt(appointments.appointmentAt, end),
        gt(sql`${appointments.appointmentAt} + ${appointments.durationMinutes} * 60000`, start),
      ))
      .limit(1)
      .get();
    if (conflict) return false;

    tx.insert(appointments).values({
      name: input.name.trim(),
      email: input.email.trim(),
      appointmentAt: start,
      durationMinutes: 30,
      timezone,
      createdAt: now.getTime(),
    }).run();
    return true;
  });
  if (!booked) return { ok: false, message: 'That time overlaps an existing appointment.' };

  return {
    ok: true,
    message: `Appointment booked for ${displayDate(appointment)}. Duration: 30 minutes.`,
    appointmentAt: appointment.toISOString(),
    appointmentEndsAt: new Date(end).toISOString(),
  };
}
