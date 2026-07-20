DELETE FROM `range_cards` WHERE `id` NOT IN (
	SELECT `id` FROM (
		SELECT `id`, ROW_NUMBER() OVER (
			PARTITION BY `rifle_id`, `load_version_id`
			ORDER BY `updated_at` DESC, `created_at` DESC, `id`
		) AS `rn`
		FROM `range_cards`
	) WHERE `rn` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `range_cards_rifle_load_version_unq` ON `range_cards` (`rifle_id`,`load_version_id`);
