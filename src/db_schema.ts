import { sqliteTable } from "drizzle-orm/sqlite-core";

export const table_settings = sqliteTable("settings", (t) => ({
	id: t.integer().primaryKey(),
	init: t.integer({ mode: "boolean" }).notNull(),
	twitch_client_id: t.text(),
	twitch_client_secret: t.text(),
	root_path: t.text().notNull().default("/"),
	mod_score: t.integer().notNull().default(999),
	ban_score: t.integer().notNull().default(0),
	cmd_prefix: t.text().notNull().default("!"),
}));

export const table_users = sqliteTable("users", (t) => ({
	uuid: t.text().primaryKey(),
	name: t.text().notNull().unique(),
	pass_hash: t.text().notNull(),
	salt: t.text().notNull(),
	is_admin: t.integer({ mode: "boolean" }).notNull(),
	is_super_admin: t.integer({ mode: "boolean" }).notNull(),
}));

export const table_user_sessions = sqliteTable("user_sessions", (t) => ({
	id: t.text().primaryKey(),
	// prettier-ignore
	user_uuid: t.text().notNull().references(() => table_users.uuid, {
		onDelete: "cascade",
		onUpdate: "cascade",
	}),
	expire_unix_ms: t.integer({ mode: "timestamp_ms" }).notNull(),
}));

export const table_user_csrfs = sqliteTable("user_csrfs", (t) => ({
	id: t.text().primaryKey(),
	// prettier-ignore
	session_id: t.text().notNull().references(() => table_user_sessions.id, {
		onDelete: "cascade",
		onUpdate: "cascade",
	}),
	expire_unix_ms: t.integer({ mode: "timestamp_ms" }).notNull(),
}));

export const table_twitch_user_permissions = sqliteTable("twitch_user_permissions", (t) => ({
	uuid: t.text().primaryKey(),
	name: t.text().notNull().unique(),
	score: t.integer().notNull(),
}));

export const table_twitch_users = sqliteTable("twitch_users", (t) => ({
	twitch_id: t.text().primaryKey(),
	twitch_uname: t.text().notNull().unique(),
	twitch_dname: t.text().notNull().unique(),
	points: t.blob({ mode: "bigint" }).notNull().unique(),
	// prettier-ignore
	perm_uuid: t.text().references(() => table_twitch_user_permissions.uuid, {
		onDelete: "set null",
		onUpdate: "cascade",
	}),
}));

export const table_twitch_bots = sqliteTable("twitch_bots", (t) => ({
	twitch_id: t.text().primaryKey(),
	twitch_uname: t.text().notNull().unique(),
	twitch_dname: t.text().notNull(),
	// Comma seperated scopes string.
	// e.g. "user:bot,user:read:chat,user:write:chat"
	twitch_client_id: t.text().notNull(),
	twitch_scopes: t.text().notNull(),
	twitch_access_token: t.text().notNull(),
	twitch_refresh_token: t.text().notNull(),
	expire_unix_ms: t.integer({ mode: "timestamp_ms" }).notNull(),
	faulty: t.integer({ mode: "boolean" }).notNull(),
}));

export const table_twitch_channels = sqliteTable("twitch_channels", (t) => ({
	twitch_id: t.text().primaryKey(),
	twitch_uname: t.text().notNull().unique(),
	twitch_dname: t.text().notNull(),
	active: t.integer({ mode: "boolean" }).notNull(),
	offline_only: t.integer({ mode: "boolean" }).notNull(),
	// prettier-ignore
	bot_twitch_id: t.text().references(() => table_twitch_bots.twitch_id, {
		onDelete: "set null",
		onUpdate: "cascade",
	}),
}));

export const table_commands = sqliteTable("commands", (t) => ({
	uuid: t.text().primaryKey(),
	name: t.text().notNull().unique(),
	active: t.integer({ mode: "boolean" }).notNull(),
	req_score: t.integer().notNull(),
	user_cooldown: t.integer().notNull(),
	chat_cooldown: t.integer().notNull(),
	description: t.text().notNull(),
	response: t.text().notNull(),
}));

export const table_command_aliases = sqliteTable("command_aliases", (t) => ({
	// prettier-ignore
	uuid: t.text().primaryKey().references(() => table_commands.uuid, {
		onDelete: "cascade",
		onUpdate: "cascade",
	}),
	alias: t.text().notNull().unique(),
	active: t.integer({ mode: "boolean" }).notNull(),
}));

export const tables = {
	settings: table_settings,
	users: table_users,
	user_sessions: table_user_sessions,
	user_csrfs: table_user_csrfs,
	twitch_user_permissions: table_twitch_user_permissions,
	twitch_users: table_twitch_users,
	twitch_bots: table_twitch_bots,
	twitch_channels: table_twitch_channels,
	commands: table_commands,
	command_aliases: table_command_aliases,
};
