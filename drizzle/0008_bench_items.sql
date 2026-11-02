CREATE TABLE `bench_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`cartridge` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`bullet_make` text,
	`bullet_model` text,
	`bullet_weight_gr` real,
	`bullet_diameter_in` real,
	`bc_value` real,
	`bc_model` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bench_items_kind_idx` ON `bench_items` (`kind`);