CREATE TABLE `load_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`load_version_id` text NOT NULL,
	`date` integer NOT NULL,
	`quantity` integer,
	`brass_lot` text,
	`powder_lot` text,
	`primer_lot` text,
	`bullet_lot` text,
	`runout_readings_in` text,
	`runout_avg_in` real,
	`runout_max_in` real,
	`runout_threshold_in` real,
	`fired_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`load_version_id`) REFERENCES `load_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `load_batches_version_idx` ON `load_batches` (`load_version_id`);--> statement-breakpoint
ALTER TABLE `range_sessions` ADD `batch_id` text REFERENCES load_batches(id);