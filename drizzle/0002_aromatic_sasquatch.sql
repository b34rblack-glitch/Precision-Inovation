ALTER TABLE `load_versions` ADD `bullet_length_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `bullet_diameter_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `bc_segments` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `mv_temp_ref_f` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `mv_temp_sens_fps_per_deg_f` real;--> statement-breakpoint
ALTER TABLE `range_cards` ADD `latitude_deg` real;--> statement-breakpoint
ALTER TABLE `range_cards` ADD `azimuth_deg` real;--> statement-breakpoint
ALTER TABLE `range_cards` ADD `incline_deg` real;--> statement-breakpoint
ALTER TABLE `range_cards` ADD `use_logged_wind` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `range_cards` ADD `spin_drift_enabled` integer DEFAULT true NOT NULL;