CREATE TABLE `custom_books` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`object_key` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_custom_books_user_updated` ON `custom_books` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`state_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
