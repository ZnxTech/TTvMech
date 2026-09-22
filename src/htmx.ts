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
				id: tables.twitch_bots.twitch_id,
				uname: tables.twitch_bots.twitch_uname,
				dname: tables.twitch_bots.twitch_dname,
				faulty: tables.twitch_bots.faulty,
			})
			.from(tables.twitch_bots)
			.orderBy(tables.twitch_bots.twitch_id)
			.all();

		res.render("elements/bots.ejs", { bots: bots });
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

		res.render("elements/users.ejs", { users: users });
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

		res.render("elements/settings.ejs", { settings: settings });
	});

	ROUTER.route("/routes").get((req, res) => {
		const session = res.locals.session as Auth.Session | undefined;
		res.render("elements/routes.ejs", { session: session });
	});

	ROUTER.route("*path").get((req, res) => {
		const error = `Could not retrive endpoint "${req.params.path.join("/")}"`;
		res.render("elements/error.ejs", { error: error });
	});
}

export default HTMX;
