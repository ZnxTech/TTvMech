import { eq } from "drizzle-orm";
import Express from "express";
import Z from "zod";

import Auth from "./auth.js";
import { db } from "./db.js";
import { tables } from "./db_schema.js";

export namespace HTMX.V1 {
	export const ROUTER = Express.Router();

	ROUTER.route("/manual").get((req, res) => {
		const settings = db
			.select({
				cmd_prefix: tables.settings.cmd_prefix,
			})
			.from(tables.settings)
			.where(eq(tables.settings.id, 0))
			.get();

		if (!settings) {
			const error = `Could not retrive settings from DB.`;
			return res.render("elements/error.ejs", { error: error });
		}

		const commands = db
			.select({
				trigger: tables.commands.trigger,
				user_cooldown: tables.commands.user_cooldown,
				chat_cooldown: tables.commands.chat_cooldown,
				req_score: tables.commands.req_score,
				description: tables.commands.description,
			})
			.from(tables.commands)
			.where(eq(tables.commands.active, true))
			.orderBy(tables.commands.trigger)
			.all();

		res.render("elements/manual.ejs", { commands: commands, cmd_prefix: settings.cmd_prefix });
	});

	ROUTER.route("/commands").get(Auth.middleSessionAuth(true, false), (req, res) => {
		const commands = db
			.select({
				trigger: tables.commands.trigger,
				user_cooldown: tables.commands.user_cooldown,
				chat_cooldown: tables.commands.chat_cooldown,
				req_score: tables.commands.req_score,
				description: tables.commands.description,
				response: tables.commands.response,
			})
			.from(tables.commands)
			.orderBy(tables.commands.trigger)
			.all();

		res.render("elements/commands.ejs", { commands: commands });
	});

	ROUTER.route("/channels").get(Auth.middleSessionAuth(true, false), (req, res) => {
		const channels = db
			.select({
				id: tables.twitch_channels.twitch_id,
				dname: tables.twitch_channels.twitch_dname,
				active: tables.twitch_channels.active,
				offline_only: tables.twitch_channels.offline_only,
				bot_id: tables.twitch_channels.bot_twitch_id,
			})
			.from(tables.twitch_channels)
			.orderBy(tables.twitch_channels.twitch_id)
			.all();

		res.render("elements/channels.ejs", { channels: channels });
	});

	ROUTER.route("/channels/bots/twitch").get(Auth.middleSessionAuth(true, false), (req, res) => {
		const bots = db
			.select({
				id: tables.twitch_bots.twitch_id,
				dname: tables.twitch_bots.twitch_dname,
			})
			.from(tables.twitch_bots)
			.where(eq(tables.twitch_bots.faulty, false))
			.orderBy(tables.twitch_bots.twitch_id)
			.all();

		const selected_result = Z.string().optional().safeParse(req.query.id);
		const selected = selected_result.success ? (selected_result.data ?? null) : null;

		res.render("elements/channel_bots.ejs", { bots: bots, selected: selected });
	});

	// Temp HTMX APIs
	ROUTER.route("/channels/bots/youtube").get(Auth.middleSessionAuth(true, false), (req, res) => {
		const bots: any[] = [];

		const selected_result = Z.string().optional().safeParse(req.query.id);
		const selected = selected_result.success ? (selected_result.data ?? null) : null;

		res.render("elements/channel_bots.ejs", { bots: bots, selected: selected });
	});

	ROUTER.route("/channels/bots/kick").get(Auth.middleSessionAuth(true, false), (req, res) => {
		const bots: any[] = [];

		const selected_result = Z.string().optional().safeParse(req.query.id);
		const selected = selected_result.success ? (selected_result.data ?? null) : null;

		res.render("elements/channel_bots.ejs", { bots: bots, selected: selected });
	});

	ROUTER.route("/bots").get(Auth.middleSessionAuth(true, false), (req, res) => {
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
		const error = `Could not retrive endpoint "/htmx/v1${req.params.path.join("/")}"`;
		res.render("elements/error.ejs", { error: error });
	});
}

export default HTMX;
