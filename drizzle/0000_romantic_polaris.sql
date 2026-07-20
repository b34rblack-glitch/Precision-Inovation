CREATE TABLE `dope_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`distance_yd` real NOT NULL,
	`elevation_hold` real,
	`windage_hold` real,
	`hold_unit` text,
	`group_size_in` real,
	`poi_up_in` real,
	`poi_right_in` real,
	`confirmed` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `range_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dope_entries_session_idx` ON `dope_entries` (`session_id`);--> statement-breakpoint
CREATE TABLE `load_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`load_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`parent_version_id` text,
	`bullet_make` text,
	`bullet_model` text,
	`bullet_weight_gr` real,
	`bc_value` real,
	`bc_model` text,
	`powder_name` text,
	`charge_gr` real,
	`primer` text,
	`brass` text,
	`brass_firings` integer,
	`cbto_in` real,
	`coal_in` real,
	`crimp` text,
	`muzzle_velocity_fps` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `load_versions_load_idx` ON `load_versions` (`load_id`);--> statement-breakpoint
CREATE TABLE `loads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cartridge` text,
	`rifle_id` text,
	`current_version_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`rifle_id`) REFERENCES `rifles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `loads_rifle_idx` ON `loads` (`rifle_id`);--> statement-breakpoint
CREATE TABLE `range_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`rifle_id` text NOT NULL,
	`load_version_id` text NOT NULL,
	`preset` text DEFAULT 'bench' NOT NULL,
	`start_distance_yd` real DEFAULT 100 NOT NULL,
	`end_distance_yd` real DEFAULT 1000 NOT NULL,
	`increment_yd` real DEFAULT 50 NOT NULL,
	`mv_override_fps` real,
	`atmo_snapshot` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`rifle_id`) REFERENCES `rifles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`load_version_id`) REFERENCES `load_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `range_cards_rifle_idx` ON `range_cards` (`rifle_id`);--> statement-breakpoint
CREATE TABLE `range_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`rifle_id` text NOT NULL,
	`load_version_id` text,
	`date` integer NOT NULL,
	`location` text,
	`temp_f` real,
	`pressure_in_hg` real,
	`altitude_ft` real,
	`humidity_pct` real,
	`wind_speed_mph` real,
	`wind_dir_clock` integer,
	`target_photo_uri` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`rifle_id`) REFERENCES `rifles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`load_version_id`) REFERENCES `load_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `range_sessions_rifle_idx` ON `range_sessions` (`rifle_id`);--> statement-breakpoint
CREATE INDEX `range_sessions_load_version_idx` ON `range_sessions` (`load_version_id`);--> statement-breakpoint
CREATE TABLE `rifles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`make` text,
	`model` text,
	`cartridge` text,
	`barrel_length_in` real,
	`twist_rate` text,
	`scope_make` text,
	`scope_model` text,
	`sight_height_in` real DEFAULT 1.9 NOT NULL,
	`turret_unit` text DEFAULT 'MIL' NOT NULL,
	`distance_unit` text DEFAULT 'yd' NOT NULL,
	`zero_distance` real DEFAULT 100 NOT NULL,
	`photo_uri` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE TABLE `shot_strings` (
	`id` text PRIMARY KEY NOT NULL,
	`workup_step_id` text,
	`session_id` text,
	`avg_fps` real,
	`sd_fps` real,
	`es_fps` real,
	`shot_count` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`device_name` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workup_step_id`) REFERENCES `workup_steps`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `range_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shot_strings_step_idx` ON `shot_strings` (`workup_step_id`);--> statement-breakpoint
CREATE INDEX `shot_strings_session_idx` ON `shot_strings` (`session_id`);--> statement-breakpoint
CREATE TABLE `shots` (
	`id` text PRIMARY KEY NOT NULL,
	`string_id` text NOT NULL,
	`seq` integer NOT NULL,
	`velocity_fps` real NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`string_id`) REFERENCES `shot_strings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shots_string_idx` ON `shots` (`string_id`);--> statement-breakpoint
CREATE TABLE `workup_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`workup_id` text NOT NULL,
	`seq` integer NOT NULL,
	`charge_gr` real NOT NULL,
	`group_size_in` real,
	`poi_x_in` real,
	`poi_y_in` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workup_id`) REFERENCES `workups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workup_steps_workup_idx` ON `workup_steps` (`workup_id`);--> statement-breakpoint
CREATE TABLE `workups` (
	`id` text PRIMARY KEY NOT NULL,
	`rifle_id` text NOT NULL,
	`load_id` text NOT NULL,
	`base_version_id` text,
	`type` text NOT NULL,
	`start_charge_gr` real,
	`increment_gr` real,
	`step_count` integer,
	`shots_per_charge` integer,
	`distance_yd` real,
	`status` text DEFAULT 'planned' NOT NULL,
	`result_load_version_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`rifle_id`) REFERENCES `rifles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`base_version_id`) REFERENCES `load_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`result_load_version_id`) REFERENCES `load_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workups_load_idx` ON `workups` (`load_id`);