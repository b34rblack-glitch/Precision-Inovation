CREATE TABLE `lands_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`rifle_id` text NOT NULL,
	`bullet_make` text,
	`bullet_model` text,
	`bullet_weight_gr` real,
	`cbto_in` real NOT NULL,
	`comparator_insert` text,
	`measured_at` integer NOT NULL,
	`round_count` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`rifle_id`) REFERENCES `rifles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lands_measurements_rifle_idx` ON `lands_measurements` (`rifle_id`);--> statement-breakpoint
ALTER TABLE `rifles` ADD `headspace_in` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `headspace_insert` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `chamber_spec` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `freebore_in` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `chamber_neck_diameter_in` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `magazine_max_coal_in` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `barrel_maker` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `barrel_contour` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `rifling_type` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `barrel_chambered_at` integer;--> statement-breakpoint
ALTER TABLE `rifles` ADD `muzzle_device` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `muzzle_device_notes` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `round_count_baseline` integer;--> statement-breakpoint
ALTER TABLE `rifles` ADD `action_make` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `action_model` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `bolt_face` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `stock` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `trigger_make` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `trigger_pull_lb` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `rifle_weight_lb` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `reticle` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `focal_plane` text;--> statement-breakpoint
ALTER TABLE `rifles` ADD `click_value` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `turret_travel_per_rev` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `zero_stop` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rifles` ADD `rail_cant_moa` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `ring_height_in` real;--> statement-breakpoint
ALTER TABLE `rifles` ADD `zero_verified_at` integer;