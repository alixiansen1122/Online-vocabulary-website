CREATE TABLE `memory_image_usage` (
	`user_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `usage_date`)
);
--> statement-breakpoint
CREATE TABLE `memory_images` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`pos` text DEFAULT '' NOT NULL,
	`meaning` text NOT NULL,
	`image_key` text NOT NULL,
	`scene_title` text NOT NULL,
	`scene_description` text NOT NULL,
	`explanation` text NOT NULL,
	`memory_tip` text NOT NULL,
	`created_by` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_memory_images_term` ON `memory_images` (`term`);