CREATE TABLE `target_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`workup_id` text,
	`workup_step_id` text,
	`session_id` text,
	`file_name` text NOT NULL,
	`sha256` text,
	`caption` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workup_id`) REFERENCES `workups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workup_step_id`) REFERENCES `workup_steps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `range_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `target_photos_workup_idx` ON `target_photos` (`workup_id`);--> statement-breakpoint
CREATE INDEX `target_photos_step_idx` ON `target_photos` (`workup_step_id`);--> statement-breakpoint
CREATE INDEX `target_photos_session_idx` ON `target_photos` (`session_id`);