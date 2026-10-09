CREATE TABLE `command_aliases` (
	`trigger` text PRIMARY KEY,
	`alias` text NOT NULL UNIQUE,
	`active` integer NOT NULL,
	CONSTRAINT `fk_command_aliases_trigger_commands_trigger_fk` FOREIGN KEY (`trigger`) REFERENCES `commands`(`trigger`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`trigger` text PRIMARY KEY,
	`active` integer NOT NULL,
	`req_score` integer NOT NULL,
	`user_cooldown` integer NOT NULL,
	`chat_cooldown` integer NOT NULL,
	`description` text NOT NULL,
	`response` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY,
	`init` integer NOT NULL,
	`twitch_client_id` text,
	`twitch_client_secret` text,
	`root_path` text DEFAULT '/' NOT NULL,
	`mod_score` integer DEFAULT 999 NOT NULL,
	`ban_score` integer DEFAULT 0 NOT NULL,
	`cmd_prefix` text DEFAULT '!' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `twitch_bots` (
	`twitch_id` text PRIMARY KEY,
	`twitch_uname` text NOT NULL UNIQUE,
	`twitch_dname` text NOT NULL,
	`twitch_client_id` text NOT NULL,
	`twitch_scopes` text NOT NULL,
	`twitch_access_token` text NOT NULL,
	`twitch_refresh_token` text NOT NULL,
	`expire_unix_ms` integer NOT NULL,
	`faulty` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `twitch_channels` (
	`twitch_id` text PRIMARY KEY,
	`twitch_uname` text NOT NULL UNIQUE,
	`twitch_dname` text NOT NULL,
	`active` integer NOT NULL,
	`offline_only` integer NOT NULL,
	`bot_twitch_id` text,
	CONSTRAINT `fk_twitch_channels_bot_twitch_id_twitch_bots_twitch_id_fk` FOREIGN KEY (`bot_twitch_id`) REFERENCES `twitch_bots`(`twitch_id`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `twitch_user_permissions` (
	`uuid` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`score` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `twitch_users` (
	`twitch_id` text PRIMARY KEY,
	`twitch_uname` text NOT NULL UNIQUE,
	`twitch_dname` text NOT NULL UNIQUE,
	`points` blob NOT NULL UNIQUE,
	`perm_uuid` text,
	CONSTRAINT `fk_twitch_users_perm_uuid_twitch_user_permissions_uuid_fk` FOREIGN KEY (`perm_uuid`) REFERENCES `twitch_user_permissions`(`uuid`) ON UPDATE CASCADE ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `user_csrfs` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`expire_unix_ms` integer NOT NULL,
	CONSTRAINT `fk_user_csrfs_session_id_user_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `user_sessions`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY,
	`user_uuid` text NOT NULL,
	`expire_unix_ms` integer NOT NULL,
	CONSTRAINT `fk_user_sessions_user_uuid_users_uuid_fk` FOREIGN KEY (`user_uuid`) REFERENCES `users`(`uuid`) ON UPDATE CASCADE ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `users` (
	`uuid` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`pass_hash` text NOT NULL,
	`salt` text NOT NULL,
	`is_admin` integer NOT NULL,
	`is_super_admin` integer NOT NULL
);
