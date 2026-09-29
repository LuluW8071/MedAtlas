import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appointments = sqliteTable('appointments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  appointmentAt: integer('appointment_at').notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  timezone: text('timezone').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('appointments_time_idx').on(table.appointmentAt)]);
