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
      'Create a new MedAtlas appointment. Use only for a new booking after all required information is known.',
    schema: z.object({
      name: z.string().trim().min(1).describe('Patient full name'),
      email: z.string().trim().min(1).describe('Patient email address'),
      appointmentDate: z.string().trim().min(1).describe('Appointment date, preferably YYYY-MM-DD'),
      appointmentTime: z.string().trim().min(1).describe('Appointment time, preferably 24-hour HH:mm'),
    }),
  },
);
