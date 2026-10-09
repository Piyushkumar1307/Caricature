import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const revealJobs = sqliteTable('reveal_jobs', {
  screen: text('screen').primaryKey(),
  jobId: text('job_id').notNull(),
  guestName: text('guest_name').notNull().default(''),
  imageKey: text('image_key'),
  status: text('status').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  acknowledgedAt: integer('acknowledged_at'),
})
