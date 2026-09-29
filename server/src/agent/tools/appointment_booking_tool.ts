import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { bookAppointment } from '../../service/appointments.js';

export const appointmentBookingTool = tool(
  async ({ name, email, appointmentDate, appointmentTime }) => {
    const missing = [
      !name && 'name',
      !email && 'email address',
      !appointmentDate && 'appointment date',
      !appointmentTime && 'appointment time',
    ].filter((value): value is string => Boolean(value));

    if (missing.length) {
      return JSON.stringify({
        ok: false,
        message: `Missing required information: ${missing.join(', ')}.`,
      });
    }

    return JSON.stringify(await bookAppointment({
      name: name!,
      email: email!,
      appointmentDate: appointmentDate!,
      appointmentTime: appointmentTime!,
    }));
  },
  {
    name: 'book_appointment',
    description:
      'Handle a MedAtlas appointment request. Use for new booking or rescheduling requests. It books when all details are present and returns missing required fields otherwise. Supports today, tomorrow, day after tomorrow, next weekday, next week (7 days from current date), YYYY-MM-DD, 12-hour time, 24-hour time, and noon.',
    schema: z.object({
      name: z.string().trim().min(1).optional().describe('Patient full name, if provided'),
      email: z.string().email().optional().describe('Patient email address, if provided'),
      appointmentDate: z.string().trim().min(1).optional().describe('Appointment date, relative or YYYY-MM-DD, if provided'),
      appointmentTime: z.string().trim().min(1).optional().describe('Appointment time, for example 9:00 AM or 14:00, if provided'),
    }),
  },
);
