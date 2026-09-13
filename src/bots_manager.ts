import NodeFS from "node:fs";
import NodePath from "node:path";

import { eq, inArray } from "drizzle-orm";
import Z from "zod";

import { Plugin, PluginState, PluginBot, MessageEvent, ChannelEvent } from "@ttvmech/plugin-api";
import { PLUGIN_SCHEMA } from "@ttvmech/plugin-api/schemas";

import { BotAuth as TwitchBotAuth } from "@ttvmech/twitch-api";

import { TwitchBot } from "./bots.js";
import { db } from "./db.js";
import { tables } from "./db_schema.js";
import Meta from "./meta.js";

interface Command {
	trigger: string;
	active: boolean;
	req_score: number;
	user_cooldown: number;
	user_cooldowns: Map<string, Date>;
	chat_cooldown: number;
	chat_cooldowns: Map<string, Date>;
	name: string;
	description: string;
	response: string;
}

export class BotManager {
	private plugins: Plugin[];

	private command_prefix: string;
	private commands: Map<string, Command>;

	private twitch_bots: Map<string, TwitchBot>;
	// private youtube_bots:
	// private kick_bots:

	public constructor() {
		this.plugins = [];

		this.commands = new Map();
		this.command_prefix = "!";

		this.twitch_bots = new Map();
	}

	private static getPluginState(): PluginState {
		return {
			getTwitchAppAuth: async () => {
				throw new Error("Twitch app auth unavilable");
			},
			getYoutubeAppAuth: async () => {
				throw new Error("Youtube app auth unavilable");
			},
			getKickAppAuth: async () => {
				throw new Error("Kick app auth unavilable");
			},
		};
	}

	private static loadCommands(): Command[] {
		return db
			.select()
			.from(tables.commands)
			.all()
			.map((data) => {
				return {
					trigger: data.trigger,
					active: data.active,
					req_score: data.req_score,
					user_cooldown: data.user_cooldown,
					user_cooldowns: new Map(),
					chat_cooldown: data.chat_cooldown,
					chat_cooldowns: new Map(),
					name: data.name,
					description: data.description,
					response: data.response,
				};
			});
	}

	private static loadCommandPrefix(): string {
		const settings = db
			.select({
				cmd_prefix: tables.settings.cmd_prefix,
			})
			.from(tables.settings)
			.where(eq(tables.settings.id, 0))
			.get();

		return settings?.cmd_prefix ?? "!";
	}

	private static async loadPlugins(): Promise<Plugin[]> {
		const files = await NodeFS.promises.readdir(Meta.META_PLUGINS_PATH, {
			withFileTypes: true,
			recursive: true,
		});

		const imports = files
			.filter((file) => file.isFile() && file.name.endsWith(".plugin.js"))
			.map((file) => import(NodePath.join(file.parentPath, file.name)));

		return (await Promise.allSettled(imports))
			.filter((result) => result.status === "fulfilled")
			.map((value) => PLUGIN_SCHEMA.safeParse(value))
			.filter((result) => result.success)
			.map((result) => result.data);
	}

	private static loadTwitchBots(): TwitchBot[] {
		const settings = db
			.select({
				client_id: tables.settings.twitch_client_id,
			})
			.from(tables.settings)
			.where(eq(tables.settings.id, 0))
			.get();

		if (!settings || !settings.client_id) {
			throw new Error("Could not obtain client id");
		}

		const twitch_client_id = settings.client_id;

		return db
			.select()
			.from(tables.twitch_bots)
			.where(eq(tables.twitch_bots.faulty, false))
			.all()
			.map((data) => {
				const auth = new TwitchBotAuth(
					data.twitch_client_id,
					data.twitch_access_token,
					data.twitch_refresh_token,
					data.twitch_scopes.split(","),
					data.expire_unix_ms
				);

				return new TwitchBot(auth, data.twitch_id, data.twitch_uname, data.twitch_dname);
			});
	}

	private static getTwitchChatterPermScore(chatter_id: string): number {
		const subquery = db
			.select({
				perm_uuid: tables.twitch_users.perm_uuid,
			})
			.from(tables.twitch_users)
			.where(eq(tables.twitch_users.twitch_id, chatter_id));

		const perm = db
			.select()
			.from(tables.twitch_user_permissions)
			.where(inArray(tables.twitch_user_permissions.uuid, subquery))
			.get();

		return perm ? perm.score : 0;
	}

	private static getOriginChatterPermScore(ev: MessageEvent): number {
		switch (ev.origin) {
			case "twitch":
				return BotManager.getTwitchChatterPermScore(ev.chatter_id);

			default:
				return 0;
		}
	}

	private processCommand(plugin_bot: PluginBot, ev: MessageEvent) {
		const [prefixed_trigger] = ev.text.split(" ");

		if (prefixed_trigger && prefixed_trigger.startsWith(this.command_prefix)) {
			const trigger = prefixed_trigger.replace(this.command_prefix, "");
			const command = this.commands.get(trigger);

			if (!command) {
				return;
			}

			// Check if cooldowns expired.

			const user_cooldown_id = `${ev.origin}:${ev.chatter_id}`;
			const chat_cooldown_id = `${ev.origin}:${ev.channel_id}`;

			const user_cooldown = command.user_cooldowns.get(user_cooldown_id);
			const chat_cooldown = command.chat_cooldowns.get(chat_cooldown_id);

			if (user_cooldown && user_cooldown.getTime() > Date.now()) {
				return;
			}

			if (chat_cooldown && chat_cooldown.getTime() > Date.now()) {
				return;
			}

			// Check for if the user has permission.

			const chatter_score = BotManager.getOriginChatterPermScore(ev);

			if (chatter_score < command.req_score) {
				return;
			}

			// Passed all checks, send response message and set cooldowns.

			plugin_bot.message(ev.channel_id, command.response);

			if (command.user_cooldown > 0) {
				const cooldown = new Date(Date.now() + command.user_cooldown);
				command.user_cooldowns.set(user_cooldown_id, cooldown);
			}

			if (command.chat_cooldown > 0) {
				const cooldown = new Date(Date.now() + command.chat_cooldown);
				command.chat_cooldowns.set(chat_cooldown_id, cooldown);
			}
		}
	}

	private onBotMessage(plugin_bot: PluginBot, ev: MessageEvent) {
		this.plugins.forEach((plugin) => {
			if (plugin.onMessage) {
				const plugin_state = BotManager.getPluginState();
				plugin.onMessage(plugin_state, plugin_bot, ev);
			}
		});

		this.processCommand(plugin_bot, ev);
	}

	private onBotJoin(plugin_bot: PluginBot, ev: ChannelEvent) {
		this.plugins.forEach((plugin) => {
			if (plugin.onJoin) {
				const plugin_state = BotManager.getPluginState();
				plugin.onJoin(plugin_state, plugin_bot, ev);
			}
		});
	}

	private onBotPart(plugin_bot: PluginBot, ev: ChannelEvent) {
		this.plugins.forEach((plugin) => {
			if (plugin.onPart) {
				const plugin_state = BotManager.getPluginState();
				plugin.onPart(plugin_state, plugin_bot, ev);
			}
		});
	}

	private onTwitchBotFault(twitch_bot: TwitchBot) {
		const twitch_id = twitch_bot.getTwitchId();
		this.twitch_bots.delete(twitch_id);
	}

	private onTwitchBotMessage(twitch_bot: TwitchBot, ev: MessageEvent) {
		const plugin_bot = twitch_bot.getPluginBot();
		this.onBotMessage(plugin_bot, ev);
	}

	private onTwitchBotJoin(twitch_bot: TwitchBot, ev: ChannelEvent) {
		const plugin_bot = twitch_bot.getPluginBot();
		this.onBotJoin(plugin_bot, ev);
	}

	private onTwitchBotPart(twitch_bot: TwitchBot, ev: ChannelEvent) {
		const plugin_bot = twitch_bot.getPluginBot();
		this.onBotPart(plugin_bot, ev);
	}

	public async init(): Promise<BotManager> {
		this.plugins = await BotManager.loadPlugins();

		const commands = BotManager.loadCommands();
		commands.forEach((command) => {
			if (!this.commands.has(command.trigger)) {
				this.commands.set(command.trigger, command);
			}
		});

		this.command_prefix = BotManager.loadCommandPrefix();

		const twitch_bots = BotManager.loadTwitchBots();
		twitch_bots.forEach((twitch_bot) => {
			const twitch_id = twitch_bot.getTwitchId();

			if (!this.twitch_bots.has(twitch_id)) {
				this.twitch_bots.set(twitch_id, twitch_bot);
				twitch_bot.setFaultListener(this.onTwitchBotFault);
				twitch_bot.setMessageListener(this.onTwitchBotMessage);
				twitch_bot.setJoinListener(this.onTwitchBotJoin);
				twitch_bot.setPartListener(this.onTwitchBotPart);
			}
		});

		return this;
	}
}

export const bot_manager = await new BotManager().init();
