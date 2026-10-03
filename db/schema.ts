import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const accounts=sqliteTable('telegram_accounts',{
  id:text('id').primaryKey(),state:text('state').notNull(),revision:integer('revision').notNull().default(0),
  lastOperation:text('last_operation'),chatId:text('chat_id'),timezone:text('timezone').notNull().default('Asia/Tashkent'),
  reminderTime:text('reminder_time').notNull().default('20:00'),reminderDays:text('reminder_days').notNull().default('[0,1,2,3,4,5,6]'),
  enabled:integer('enabled').notNull().default(0),nextAt:integer('next_at'),lastDelivery:text('last_delivery'),
},t=>[index('telegram_accounts_due').on(t.enabled,t.nextAt)]);
export const receipts=sqliteTable('telegram_receipts',{id:text('id').primaryKey(),created:integer('created').notNull()});
