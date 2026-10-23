import { eq } from "drizzle-orm";

import { db } from "./main.js";
import { table_defaults, tables } from "./schema.js";

export const defaults = table_defaults.settings;

function init() {
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
}

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

	export function updateTwitchClient(client_id: string, client_secret: string) {
		const _ = db
			.update(tables.settings)
			.set({
				twitch_client_id: client_id,
				twitch_client_secret: client_secret,
			})
			.where(eq(tables.settings.id, 0))
			.run();
	}

	export function update(opt: {
		cmd_prefix?: string;
		root_path?: string;
		mod_score?: number;
		ban_score?: number;
	}) {
		const _ = db
			.update(tables.settings)
			.set(opt)
			.where(eq(tables.settings.id, 0))
			.run();
	}

	export function setInitialized() {
		const _ = db
			.update(tables.settings)
			.set({
				init: true,
			})
			.where(eq(tables.settings.id, 0))
			.run();
	}
}

// Check if settings exist in table, if not insert default.
init();
