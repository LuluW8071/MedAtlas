import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { rescheduleAppointment } from '../../service/appointments.js';

export const appointmentReschedulingTool = tool(
  async ({ email, new_date, new_time }) => {
    const missing = [
      !email?.trim() && 'email address',
      !new_date?.trim() && 'new appointment date',
      !new_time?.trim() && 'new appointment time',
    ].filter((value): value is string => Boolean(value));

    if (missing.length) {
      return JSON.stringify({
        ok: false,
        missingFields: missing,
        message: `Please provide the missing information: ${missing.join(', ')}.`,
      });
    }

    return JSON.stringify(await rescheduleAppointment(email!, new_date!, new_time!));
  },
  {
    name: 'reschedule_appointment',
    description: 'Move one scheduled appointment to a requested date and time, identified only by email. Use only when email, new date, and new time are known. Checks availability and preserves the original appointment if the change cannot be made.',
    schema: z.object({
      email: z.string().trim().min(1).describe('Email address used to book the appointment'),
      new_date: z.string().trim().min(1).describe('Requested new appointment date, preferably YYYY-MM-DD'),
      new_time: z.string().trim().min(1).describe('Requested new appointment time, preferably 24-hour HH:mm'),
    }),
  },
);
