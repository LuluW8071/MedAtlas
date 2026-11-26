import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { cancelAppointment } from '../../service/appointments.js';

export const appointmentCancellationTool = tool(
  async ({ email }) => {
    if (!email?.trim()) {
      return JSON.stringify({
        ok: false,
        missingFields: ['email'],
        message: 'Please provide the email address used for the appointment.',
      });
    }

    return JSON.stringify(await cancelAppointment(email));
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel one scheduled appointment identified only by the patient email address. Use only when email is known. Does not cancel when no appointment or multiple appointments match.',
    schema: z.object({
      email: z.string().trim().min(1).describe('Email address used to book the appointment'),
    }),
  },
);
