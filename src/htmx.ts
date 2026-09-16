import { eq } from "drizzle-orm";
import Express from "express";

import Auth from "./auth.js";
import { db } from "./db.js";
import { tables } from "./db_schema.js";

export namespace HTMX.V1 {
	export const ROUTER = Express.Router();

	ROUTER.route("/bots").get(Auth.middleSessionAuth(true, true), (req, res) => {
		const bots = db
			.select({
				twitch_id: tables.twitch_bots.twitch_id,
				twitch_uname: tables.twitch_bots.twitch_uname,
				twitch_dname: tables.twitch_bots.twitch_dname,
			})
			.from(tables.twitch_bots)
			.orderBy(tables.twitch_bots.twitch_id)
			.all();

		res.status(200).render("elements/bots.ejs", { bots: bots });
	});

	ROUTER.route("/users").get(Auth.middleSessionAuth(true, true), (req, res) => {
		const users = db
			.select({
				uuid: tables.users.uuid,
				name: tables.users.name,
				is_admin: tables.users.is_admin,
				is_super_admin: tables.users.is_super_admin,
			})
			.from(tables.users)
			.orderBy(tables.users.uuid)
			.all();

		res.status(200).render("elements/users.ejs", { users: users });
	});

	ROUTER.route("/settings").get(Auth.middleSessionAuth(true, true), (req, res) => {
		const settings = db
			.select({
				cmd_prefix: tables.settings.cmd_prefix,
				root_path: tables.settings.root_path,
				mod_score: tables.settings.mod_score,
				ban_score: tables.settings.ban_score,
			})
			.from(tables.settings)
			.where(eq(tables.settings.id, 0))
			.get();

		if (!settings) {
			return res.sendStatus(500);
		}

		res.status(200).render("elements/settings.ejs", { settings: settings });
	});

	ROUTER.route("/routes").get((req, res) => {
		const session = res.locals.session as Auth.Session | undefined;
		res.status(200).render("elements/routes.ejs", { session: session });
	});
}

export default HTMX;
