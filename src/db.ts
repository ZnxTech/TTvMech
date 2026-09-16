import { DatabaseSync, StatementResultingChanges } from "node:sqlite";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";

import { tables } from "./db_schema.js";
import Meta from "./meta.js";

const node_db = new DatabaseSync(Meta.META_DB_PATH, { open: true });
node_db.exec("PRAGMA journal_mode = WAL;");

export const db = drizzle({ client: node_db });

export namespace Util {
	export function isInit(fail_as: boolean): boolean {
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
			.insert(tables.settings)
			.values({
				id: 0,
				init: false,
				twitch_client_id: client_id,
				twitch_client_secret: client_secret,
			})
			.onConflictDoUpdate({
				target: tables.settings.id,
				set: {
					twitch_client_id: client_id,
					twitch_client_secret: client_secret,
				},
			})
			.run();

		return sql_res;
	}

	export function settingsUpdateCommon(
		cmd_prefix: string,
		root_path: string,
		mod_score: number,
		ban_score: number
	): StatementResultingChanges {
		const sql_res = db
			.insert(tables.settings)
			.values({
				id: 0,
				init: false,
				cmd_prefix: cmd_prefix,
				root_path: root_path,
				mod_score: mod_score,
				ban_score: ban_score,
			})
			.onConflictDoUpdate({
				target: tables.settings.id,
				set: {
					cmd_prefix: cmd_prefix,
					root_path: root_path,
					mod_score: mod_score,
					ban_score: ban_score,
				},
			})
			.run();

		return sql_res;
	}

	export function settingsSetInitialized(): StatementResultingChanges {
		const sql_res = db
			.insert(tables.settings)
			.values({
				id: 0,
				init: true,
			})
			.onConflictDoUpdate({
				target: tables.settings.id,
				set: { init: true },
			})
			.run();

		return sql_res;
	}
}
