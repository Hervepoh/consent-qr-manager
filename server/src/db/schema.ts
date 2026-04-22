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
  contact: varchar('contact', { length: 255 }).primaryKey(),
  attempts: int('attempts').default(0),
  blockedUntil: timestamp('blocked_until'),
  nextBlockDurationMinutes: int('next_block_duration_minutes').default(5),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

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
