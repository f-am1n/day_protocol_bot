CREATE TABLE `telegram_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`last_operation` text,
	`chat_id` text,
	`timezone` text DEFAULT 'Asia/Tashkent' NOT NULL,
	`reminder_time` text DEFAULT '20:00' NOT NULL,
	`reminder_days` text DEFAULT '[0,1,2,3,4,5,6]' NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`next_at` integer,
	`last_delivery` text
);
--> statement-breakpoint
CREATE INDEX `telegram_accounts_due` ON `telegram_accounts` (`enabled`,`next_at`);--> statement-breakpoint
CREATE TABLE `telegram_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
