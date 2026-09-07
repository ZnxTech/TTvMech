import CookieParser from "cookie-parser";
import { eq } from "drizzle-orm";
import Express from "express";
import Qs from "qs";
import Z from "zod";

import { BotAuth } from "@ttvmech/twitch-api";

import Auth from "./auth.js";
import { tables } from "./db_schema.js";
import { db, Util as DBUtil } from "./db.js";
import Meta from "./meta.js";

export namespace API.V1 {
	export const ROUTER = Express.Router();

	ROUTER.route("/meta/init").post((req, res) => {
		if (DBUtil.isInit(true)) {
			res.sendStatus(403);
		}

		const body = Z.object({
			client_id: Z.string(),
			client_secret: Z.string(),
			admin_name: Z.string(),
			admin_pass: Z.string(),
		}).safeParse(req.body);

		if (!body.success) {
			return res.status(400).send("Invalid request body.");
		}

		Auth.createUser(body.data.admin_name, body.data.admin_pass, true, true);

		DBUtil.settingsUpdateClient(body.data.client_id, body.data.client_secret);
		DBUtil.settingsSetInitialized();

		res.appendHeader("HX-Redirect", "/dashboard");
		res.sendStatus(200);
	});

	ROUTER.route("/users")
		.get(Auth.middleSessionAuth(true, true), (req, res) => {
			const users = db
				.select({
					uuid: tables.users.uuid,
					name: tables.users.name,
					is_admin: tables.users.is_admin,
					is_super_admin: tables.users.is_super_admin,
				})
				.from(tables.users)
				.orderBy(tables.users.name)
				.all();

			res.status(200).json({ data: users });
		})
		.post(Auth.middleSessionAuth(true, true), (req, res) => {
			const body = Z.object({
				user_name: Z.string().min(3).max(64),
				user_pass: Z.string().min(8).max(64),
				user_rank: Z.enum(["none", "admin", "super_admin"]),
			}).safeParse(req.body);

			if (!body.success) {
				return res.status(400).send("Invalid request body.");
			}

			const req_admin = body.data.user_rank === "admin" || body.data.user_rank === "super_admin";
			const req_super_admin = body.data.user_rank === "super_admin";

			Auth.createUser(body.data.user_name, body.data.user_pass, req_admin, req_super_admin);

			res.appendHeader("HX-Trigger", "ttv:reloadUsers");
			res.sendStatus(200);
		});

	ROUTER.route("/users/auth")
		.post((req, res) => {
			const body = Z.object({
				user_name: Z.string(),
				user_pass: Z.string(),
			}).safeParse(req.body);

			if (!body.success) {
				return res.status(400).send("Invalid request body.");
			}

			try {
				const [session_id, expires_in] = Auth.createUserSession(body.data.user_name, body.data.user_pass);
				res.cookie("session_id", session_id, {
					maxAge: expires_in,
					sameSite: "lax",
					httpOnly: true,
					secure: false,
				});
				res.appendHeader("HX-Redirect", "/dashboard");
				res.sendStatus(200);
			} catch {
				res.status(403).send("Invalid username or password.");
			}
		})
		.delete(Auth.middleSessionAuth(false, false), (req, res) => {
			const session = res.locals.session as Auth.Session | undefined;

			if (session === undefined) {
				return res.status(400).send("No session found");
			}

			const sql_res = db.delete(tables.user_sessions).where(eq(tables.user_sessions.id, session.id)).run();

			res.clearCookie("session_id");
			res.appendHeader("HX-Trigger", "ttv:reloadRoutes");
			res.appendHeader("HX-Redirect", "/dashboard");
			res.status(200).send(`<a id="login" href="/login" class="btn tx-b">Login</a>`);
		});

	ROUTER.route("/users/:user_uuid")
		.get(Auth.middleSessionAuth(true, true), (req, res) => {
			const user_uuid = Z.uuidv7().safeParse(req.params.user_uuid);

			if (!user_uuid.success) {
				return res.status(400).send("Invalid request body.");
			}

			const user = db
				.select({
					uuid: tables.users.uuid,
					name: tables.users.name,
					is_admin: tables.users.is_admin,
					is_super_admin: tables.users.is_super_admin,
				})
				.from(tables.users)
				.where(eq(tables.users.uuid, user_uuid.data))
				.get();

			if (user === undefined) {
				res.status(400).send("Invalid user UUID.");
			} else {
				res.status(200).json(user);
			}
		})
		.delete(Auth.middleSessionAuth(true, true), (req, res) => {
			const user_uuid = Z.uuidv7().safeParse(req.params.user_uuid);

			if (!user_uuid.success) {
				return res.status(400).send("Invalid request body.");
			}

			const user = db
				.select({
					uuid: tables.users.uuid,
					name: tables.users.name,
					is_admin: tables.users.is_admin,
					is_super_admin: tables.users.is_super_admin,
				})
				.from(tables.users)
				.where(eq(tables.users.uuid, user_uuid.data))
				.get();

			if (user === undefined) {
				return res.status(400).send("Invalid user UUID.");
			}

			if (user.is_super_admin) {
				// Check if this super admin is the last remaining super admin.
				const super_admin_count = db.$count(tables.users, eq(tables.users.is_super_admin, true)).sync();

				if (super_admin_count <= 1) {
					// Exit deletion to prevent softlock.
					return res.status(400).send("Can not delete last remaining Super-Admin.");
				}
			}

			const sql_res = db.delete(tables.users).where(eq(tables.users.uuid, user_uuid.data)).run();

			if (sql_res.changes == 0) {
				// Loosely compare
				res.status(400).send("Invalid user UUID.");
			} else {
				res.appendHeader("HX-Trigger", "ttv:reloadUsers");
				res.sendStatus(200);
			}
		});

	ROUTER.route("/settings").put(Auth.middleSessionAuth(true, true), (req, res) => {
		const body = Z.object({
			cmd_prefix: Z.string(),
			root_path: Z.string(),
			mod_score: Z.coerce.number().int(),
			ban_score: Z.coerce.number().int(),
		}).safeParse(req.body);

		if (!body.success) {
			return res.status(400).send("Invalid request body.");
		}

		DBUtil.settingsUpdateCommon(
			body.data.cmd_prefix,
			body.data.root_path,
			body.data.mod_score,
			body.data.ban_score
		);
		res.sendStatus(200);
	});

	ROUTER.route("/settings/client").put(Auth.middleSessionAuth(true, true), (req, res) => {
		const body = Z.object({
			client_id: Z.string(),
			client_secret: Z.string(),
		}).safeParse(req.body);

		if (!body.success) {
			return res.status(400).send("Invalid request body.");
		}

		DBUtil.settingsUpdateClient(body.data.client_id, body.data.client_secret);
		res.sendStatus(200);
	});

	ROUTER.route("/bots/twitch").get(Auth.middleSessionAuth(true, false), (req, res) => {
		const twitch_bots = db
			.select({
				twitch_id: tables.twitch_bots.twitch_id,
				twitch_uname: tables.twitch_bots.twitch_uname,
				twitch_dname: tables.twitch_bots.twitch_dname,
			})
			.from(tables.twitch_bots)
			.orderBy(tables.twitch_bots.twitch_uname)
			.all();

		res.status(200).json({ data: twitch_bots });
	});

	ROUTER.route("/bots/twitch/auth")
		// This type of request would usually be a POST request,
		// but since its a redirect from Twitch OAuth it can only be a GET request.
		.get(Auth.middleSessionAuth(true, false), async (req, res) => {
			const query = Z.object({
				code: Z.string(),
				scope: Z.string(),
				state: Z.string().optional(),
			}).safeParse(req.query);

			if (!query.success) {
				const error = Z.object({
					error: Z.string(),
					error_description: Z.string(),
					state: Z.string().optional(),
				}).safeParse(req.query);

				const query_str = Qs.stringify({
					error: "bot",
					type: "twitch",
					message: error.success ? error.data.error_description : undefined,
				});

				return res.redirect(307, `/bots?${query_str}`);
			}

			const settings = db
				.select({
					client_id: tables.settings.twitch_client_id,
					client_secret: tables.settings.twitch_client_secret,
				})
				.from(tables.settings)
				.where(eq(tables.settings.id, 0))
				.get();

			if (settings === undefined || settings.client_id === null || settings.client_secret === null) {
				const query_str = Qs.stringify({
					error: "bot",
					type: "client",
					message: "Could not obtain client ID and secret.",
				});

				return res.redirect(307, `/bots?${query_str}`);
			}

			const auth = await BotAuth.request(
				settings.client_id,
				settings.client_secret,
				query.data.code,
				`${req.protocol}://${req.host}${req.path}`
			);

			const validation = await auth.validate();

			const sql_res = db
				.insert(tables.twitch_bots)
				.values({
					twitch_id: validation.user_id,
					twitch_dname: validation.login,
					twitch_uname: validation.login,
					twitch_client_id: validation.client_id,
					twitch_access_token: auth.token(),
					twitch_refresh_token: auth.refreshToken(),
					twitch_scopes: auth.scope().join(","),
					expire_unix_ms: auth.expiresAt(),
					faulty: false,
				})
				.onConflictDoUpdate({
					target: tables.twitch_bots.twitch_id,
					set: {
						twitch_dname: validation.login,
						twitch_uname: validation.login,
						twitch_client_id: validation.client_id,
						twitch_access_token: auth.token(),
						twitch_refresh_token: auth.refreshToken(),
						twitch_scopes: auth.scope().join(","),
						expire_unix_ms: auth.expiresAt(),
						faulty: false,
					},
				})
				.run();

			res.redirect(307, "/bots");
		});

	ROUTER.route("/bots/twitch/link").get(Auth.middleSessionAuth(true, false), (req, res) => {
		const redirect_uri = `${req.protocol}://${req.host}/api/v1/bots/twitch/auth`;

		const settings = db
			.select({
				client_id: tables.settings.twitch_client_id,
			})
			.from(tables.settings)
			.where(eq(tables.settings.id, 0))
			.get();

		if (settings === undefined || settings.client_id === null) {
			return res.sendStatus(500);
		}

		const session = res.locals.session as Auth.Session | undefined;

		if (session === undefined) {
			return res.sendStatus(400);
		}

		const state = Auth.createCSRF(session.id);

		const url = new URL("https://id.twitch.tv/oauth2/authorize");
		url.searchParams.append("client_id", settings.client_id);
		url.searchParams.append("force_verify", "true");
		url.searchParams.append("redirect_uri", redirect_uri);
		url.searchParams.append("response_type", "code");
		url.searchParams.append("scope", "user:bot user:read:chat user:write:chat");
		url.searchParams.append("state", state);

		res.appendHeader("HX-Redirect", url.toString());
		res.sendStatus(200);
	});

	ROUTER.route("/bots/twitch/:twitch_id")
		.get(Auth.middleSessionAuth(true, false), (req, res) => {
			const twitch_id = req.params.twitch_id;

			const twitch_bot = db
				.select({
					twitch_id: tables.twitch_bots.twitch_id,
					twitch_uname: tables.twitch_bots.twitch_uname,
					twitch_dname: tables.twitch_bots.twitch_dname,
				})
				.from(tables.twitch_bots)
				.where(eq(tables.twitch_bots.twitch_id, twitch_id))
				.get();

			if (twitch_bot === undefined) {
				res.status(400).send("Invalid bot Twitch id.");
			} else {
				res.status(200).json({ data: twitch_bot });
			}
		})
		.delete(Auth.middleSessionAuth(true, false), (req, res) => {
			const twitch_id = req.params.twitch_id;

			const sql_res = db.delete(tables.twitch_bots).where(eq(tables.twitch_bots.twitch_id, twitch_id)).run();

			if (sql_res.changes == 0) {
				// Loosely compare
				res.status(400).send("Invalid bot Twitch id.");
			} else {
				res.sendStatus(200);
			}
		});
}

export default API;
