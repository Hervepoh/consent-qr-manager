import { mysqlTable, serial, varchar, timestamp, text, index, boolean, int } from 'drizzle-orm/mysql-core';

export const otps = mysqlTable('otps', {
  id: serial('id').primaryKey(),
  contact: varchar('contact', { length: 255 }).notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  ip: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => {
  return {
    contactIdx: index('contact_idx').on(table.contact),
  };
});

export const otpThrottle = mysqlTable('otp_throttle', {
  contact: varchar('contact', { length: 255 }).notNull(),
  action: varchar('action', { length: 20 }).notNull(), // 'send' | 'verify'
  attempts: int('attempts').default(0),
  blockedUntil: timestamp('blocked_until'),
  nextBlockDurationMinutes: int('next_block_duration_minutes').default(5),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (table) => ({
  pk: index('pk').on(table.contact, table.action),
}));
// Note: En MySQL, on utilisera une clé composite. 
// Pour simplifier l'accès, je garde l'index et je gèrerai le filtrage dans le code.

export const consents = mysqlTable('consents', {
  id: serial('id').primaryKey(),
  contractNumber: varchar('contract_number', { length: 50 }).notNull(),
  clientName: varchar('client_name', { length: 255 }).notNull(),
  channel: varchar('channel', { length: 20 }).notNull(), // SMS, WHATSAPP, EMAIL
  contactValue: varchar('contact_value', { length: 255 }).notNull(),
  language: varchar('language', { length: 5 }).notNull(), // FR, EN
  status: varchar('status', { length: 50 }).notNull(), // Bailleur, Locataire, Autre
  isNotOwner: boolean('is_not_owner').default(false),
  ip: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const smsQueue = mysqlTable('sms_queue', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull(),
  message: text('message').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | sent | failed
  attempts: int('attempts').notNull().default(0),
  maxAttempts: int('max_attempts').notNull().default(5),
  lastAttemptAt: timestamp('last_attempt_at'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow(),
  scheduledFor: timestamp('scheduled_for').defaultNow(), // pour retry différé
  providerResponse: text('provider_response'),
  lastError: text('last_error'),
}, (table) => ({
  statusIdx: index('status_idx').on(table.status),
  scheduledIdx: index('scheduled_idx').on(table.scheduledFor),
}));

export const mailQueue = mysqlTable('mail_queue', {
  id: serial('id').primaryKey(),
  to: varchar('to', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  templateName: varchar('template_name', { length: 100 }).notNull(),
  templateData: text('template_data').notNull(), // JSON stringifié
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  attempts: int('attempts').notNull().default(0),
  maxAttempts: int('max_attempts').notNull().default(5),
  lastAttemptAt: timestamp('last_attempt_at'),
  sentAt: timestamp('sent_at'),
  scheduledFor: timestamp('scheduled_for').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  providerResponse: text('provider_response'),
  lastError: text('last_error'),
}, (table) => ({
  statusIdx: index('mail_status_idx').on(table.status),
  scheduledIdx: index('mail_scheduled_idx').on(table.scheduledFor),
}));

export const cronLocks = mysqlTable('cron_locks', {
  name: varchar('name', { length: 100 }).primaryKey(),
  lockedAt: timestamp('locked_at').notNull(),
  lockedUntil: timestamp('locked_until').notNull(), // TTL sécurité anti-deadlock
});