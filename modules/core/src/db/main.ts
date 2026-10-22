import NodeFS from "node:fs";
import NodePath from "node:path";
import { DatabaseSync, StatementResultingChanges } from "node:sqlite";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

import { tables } from "./schema.js";
import Meta from "../meta.js";

// Resolve db path and create parent directories if they are missing.
const node_db_path = NodePath.resolve(Meta.META_DB_PATH);
NodeFS.mkdirSync(NodePath.dirname(node_db_path), { recursive: true });

// Create the node:sqlite db manually to setup WAL before feeding it into drizzle.
const node_db = new DatabaseSync(node_db_path, { open: true });
node_db.exec("PRAGMA journal_mode = WAL;");

// Create drizzle db and migrate if there are any pending migrations.
export const db = drizzle({ client: node_db });
migrate(db, { migrationsFolder: "migrations" });

// Check if settings exist in table, if not insert default.
const settings = db
	.select({
		id: tables.settings.id,
	})
	.from(tables.settings)
	.where(eq(tables.settings.id, 0))
	.get();

if (!settings) {
	const sql_res = db
		.insert(tables.settings)
		.values({
			id: 0,
			init: false,
		})
		.run();

	if (sql_res.changes === 0) {
		throw new Error("Settings could not be initialized");
	}
}

export namespace Util {
	export function settingsIsInit(fail_as: boolean): boolean {
		const settings = db
			.select({
				init: tables.settings.init,
			})
			.from(tables.settings)
			.where(eq(tables.settings.id, 0))
			.get();

		if (!settings) {
			return fail_as;
		} else {
			return settings.init;
		}
	}

	export function settingsUpdateClient(client_id: string, client_secret: string): StatementResultingChanges {
		const sql_res = db
			.update(tables.settings)
			.set({
				twitch_client_id: client_id,
				twitch_client_secret: client_secret,
			})
			.where(eq(tables.settings.id, 0))
			.run();

		return sql_res;
	}

	export function settingsUpdate(opt: {
		cmd_prefix?: string;
		root_path?: string;
		mod_score?: number;
		ban_score?: number;
	}): StatementResultingChanges {
		const sql_res = db
			.update(tables.settings)
			.set({
				cmd_prefix: opt.cmd_prefix,
				root_path: opt.root_path,
				mod_score: opt.mod_score,
				ban_score: opt.ban_score,
			})
			.where(eq(tables.settings.id, 0))
			.run();

		return sql_res;
	}

	export function settingsSetInitialized(): StatementResultingChanges {
		const sql_res = db
			.update(tables.settings)
			.set({
				init: true,
			})
			.where(eq(tables.settings.id, 0))
			.run();

		return sql_res;
	}
}
