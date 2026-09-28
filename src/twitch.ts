import { eq } from "drizzle-orm";

import { AppAuth, Helix } from "@ttvmech/twitch-api";

import { db } from "./db.js";
import { tables } from "./db_schema.js";

export namespace Util {
	let auth: AppAuth | undefined;

	export async function getAppAuth(): Promise<AppAuth> {
		if (!auth || auth.expired()) {
			const settings = db
				.select({
					client_id: tables.settings.twitch_client_id,
					client_secret: tables.settings.twitch_client_secret,
				})
				.from(tables.settings)
				.where(eq(tables.settings.id, 0))
				.get();

			if (!settings || !settings.client_id || !settings.client_secret) {
				throw new Error("Could not obtain Twitch client");
			}

			auth = await AppAuth.request(settings.client_id, settings.client_secret);
		}

		return auth;
	}
}
