ALTER TABLE `load_versions` ADD `case_trim_length_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `case_trimmed_to` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `case_neck_turned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `neck_wall_thickness_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `case_prep_notes` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `primer_pocket_uniformed` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `flash_hole_deburred` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `case_volume_gr_h2o` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `case_weight_gr` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `case_annealed` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `anneal_method` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `case_lot_number` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `sizing_die` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `sizing_die_type` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `bushing_size_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `expander_mandrel_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `shoulder_bump_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `seating_die` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `seating_die_micrometer` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `crimp_die` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `press_name` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `lube_method` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `powder_lot_number` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `charge_method` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `charge_variance_gr` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `primer_lot_number` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `primer_seating_depth_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `bullet_lot_number` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `bullet_sorted_by` text;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `jump_to_lands_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `neck_tension_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `runout_in` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `loaded_round_weight_gr` real;--> statement-breakpoint
ALTER TABLE `load_versions` ADD `assembly_notes` text;