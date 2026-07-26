CREATE TABLE `sync_row_meta` (
	`tbl` text NOT NULL,
	`row_id` text NOT NULL,
	`hlc` text NOT NULL,
	`writer` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`tbl`, `row_id`)
);
--> statement-breakpoint
CREATE INDEX `sync_row_meta_writer_idx` ON `sync_row_meta` (`writer`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`device_name` text NOT NULL,
	`platform` text NOT NULL,
	`hlc_millis` integer DEFAULT 0 NOT NULL,
	`hlc_counter` integer DEFAULT 0 NOT NULL,
	`root_folder_id` text,
	`devices_folder_id` text,
	`blobs_folder_id` text,
	`my_file_id` text,
	`manifest_file_id` text,
	`peer_cache_json` text,
	`google_account_email` text,
	`last_sync_at` integer,
	`last_published_hlc` text,
	`last_sync_error` text
);
--> statement-breakpoint
ALTER TABLE `range_sessions` ADD `target_photo_sha256` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `photo_sha256` text;