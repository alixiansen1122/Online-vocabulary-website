CREATE TABLE `study_events` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_date` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`word_id` text NOT NULL,
	`word_term` text DEFAULT '' NOT NULL,
	`book_id` text DEFAULT '' NOT NULL,
	`book_title` text DEFAULT '' NOT NULL,
	`correct` integer DEFAULT false NOT NULL,
	`first_try` integer DEFAULT false NOT NULL,
	`review` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_study_events_user_date` ON `study_events` (`user_id`,`event_date`);--> statement-breakpoint
CREATE INDEX `idx_study_events_user_word` ON `study_events` (`user_id`,`word_id`);