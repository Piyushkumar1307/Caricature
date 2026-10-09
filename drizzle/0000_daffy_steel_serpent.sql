CREATE TABLE `reveal_jobs` (
	`screen` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`guest_name` text DEFAULT '' NOT NULL,
	`image_key` text,
	`status` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`acknowledged_at` integer
);
