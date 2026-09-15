import { eq } from "drizzle-orm";
import Z from "zod";

import { PluginBot, MessageEvent, ChannelEvent } from "@ttvmech/plugin-api";

import { BotAuth as TwitchBotAuth, Helix, EventSub } from "@ttvmech/twitch-api";
import { EventSubWebSocket, EventSubWebSocketSession } from "@ttvmech/twitch-api/eventsub";
import { EventSubSchemas } from "@ttvmech/twitch-api/schemas";

import { db } from "./db.js";
import { tables } from "./db_schema.js";

const GLOBAL_MESSAGES_PER_30S = 20;
const GLOBAL_MESSAGES_PER_30S_MODDED = 100;
const CHANNEL_MESSAGES_PER_1S = 1;

interface TwitchBotMessage {
	channel_id: string;
	message: string;
	reply_to_message_id?: string;
	resolve: (res: boolean) => void;
}

interface TwitchBotJoin {
	twitch_id: string;
	twitch_uname: string;
	twitch_dname: string;
	is_online: boolean;
	eventsub_ids: string[];
}

export class TwitchBot {
	private auth: TwitchBotAuth;
	private twitch_id: string;
	private twitch_uname: string;
	private twitch_dname: string;

	private eventsub_ws: EventSubWebSocket;
	private eventsub_ws_session: Promise<EventSubWebSocketSession> | null;

	private message_queue: TwitchBotMessage[];
	private messages_sent: number;
	private messages_in_queue: boolean;

	private joins: Map<string, TwitchBotJoin>;

	private message_listener: (bot: TwitchBot, ev: MessageEvent) => void;
	private stream_listener: (bot: TwitchBot, ev: ChannelEvent) => void;
	private join_listener: (bot: TwitchBot, ev: ChannelEvent) => void;
	private part_listener: (bot: TwitchBot, ev: ChannelEvent) => void;
	private fault_listener: (bot: TwitchBot) => void;

	public constructor(auth: TwitchBotAuth, twitch_id: string, twitch_uname: string, twitch_dname: string) {
		this.auth = auth;
		this.twitch_id = twitch_id;
		this.twitch_uname = twitch_uname;
		this.twitch_dname = twitch_dname;

		this.eventsub_ws = new EventSubWebSocket();

		this.eventsub_ws.addEventListener("channel.chat.message", (ev) => {
			const message = EventSubSchemas.CHANNEL_CHAT_MESSAGE.safeParse(ev);

			if (message.success) {
				const join = this.joins.get(message.data.broadcaster_user_id);
				if (!join) {
					// Recived message from a channel that the bot did not join to, ignore.
					return;
				}

				const is_sub = message.data.badges.some((badge) => {
					return ["subscriber", "founder"].includes(badge.set_id);
				});

				const is_mod = message.data.badges.some((badge) => {
					return ["moderator", "lead_moderator", "global_mod", "admin"].includes(badge.set_id);
				});

				this.message_listener(this, {
					origin: "twitch",
					text: message.data.message.text,
					message_id: message.data.message_id,
					chatter_id: message.data.chatter_user_id,
					chatter_uname: message.data.chatter_user_login,
					chatter_dname: message.data.chatter_user_name,
					chatter_is_sub: is_sub,
					chatter_is_mod: is_mod,
					channel_id: message.data.broadcaster_user_id,
					channel_uname: message.data.broadcaster_user_login,
					channel_dname: message.data.broadcaster_user_name,
				});
			}
		});

		this.eventsub_ws.addEventListener("stream.online", (ev) => {
			const online = EventSubSchemas.STREAM_ONLINE.safeParse(ev);

			if (online.success) {
				const join = this.joins.get(online.data.broadcaster_user_id);

				if (!join) {
					return;
				}

				join.is_online = true;
				this.stream_listener(this, {
					origin: "twitch",
					status: "live",
					channel_id: online.data.broadcaster_user_id,
					channel_uname: online.data.broadcaster_user_login,
					channel_dname: online.data.broadcaster_user_name,
				});
			}
		});

		this.eventsub_ws.addEventListener("stream.offline", (ev) => {
			const offline = EventSubSchemas.STREAM_OFFLINE.safeParse(ev);

			if (offline.success) {
				const join = this.joins.get(offline.data.broadcaster_user_id);

				if (!join) {
					return;
				}

				join.is_online = false;
				this.stream_listener(this, {
					origin: "twitch",
					status: "offline",
					channel_id: offline.data.broadcaster_user_id,
					channel_uname: offline.data.broadcaster_user_login,
					channel_dname: offline.data.broadcaster_user_name,
				});
			}
		});

		this.eventsub_ws_session = null;

		this.message_queue = [];
		this.messages_sent = 0;
		this.messages_in_queue = false;

		this.joins = new Map();

		this.message_listener = () => {};
		this.stream_listener = () => {};
		this.join_listener = () => {};
		this.part_listener = () => {};
		this.fault_listener = () => {};
	}

	private setFaulty() {
		const _ = db
			.update(tables.twitch_bots)
			.set({ faulty: true })
			.where(eq(tables.twitch_bots.twitch_id, this.twitch_id))
			.run();
	}

	private async getAuth(): Promise<TwitchBotAuth> {
		if (this.auth.expired()) {
			const settings = db
				.select({
					client_secret: tables.settings.twitch_client_secret,
				})
				.from(tables.settings)
				.where(eq(tables.settings.id, 0))
				.get();

			if (!settings || !settings.client_secret) {
				throw new Error("Failed to obtain client secret");
			}

			await this.auth.refresh(settings.client_secret);
			const _ = db
				.update(tables.twitch_bots)
				.set({
					twitch_access_token: this.auth.token(),
					twitch_refresh_token: this.auth.refreshToken(),
					twitch_scopes: this.auth.scope().join(","),
					expire_unix_ms: this.auth.expiresAt(),
				})
				.where(eq(tables.twitch_bots.twitch_id, this.twitch_id))
				.run();
		}

		return this.auth;
	}

	private async getEventSubSession(): Promise<EventSubWebSocketSession> {
		if (!this.eventsub_ws_session) {
			const auth = await this.getAuth();

			this.eventsub_ws_session = new Promise((res, rej) => {
				this.eventsub_ws.setWelcomeListener(async (ev) => {
					const eventsubs = await Helix.getEventSubs(auth, {});
					const session: EventSubWebSocketSession = {
						id: ev.payload.session.id,
						total: eventsubs.total,
						total_cost: eventsubs.total_cost,
						total_max_cost: eventsubs.max_total_cost,
					};

					this.eventsub_ws.setWelcomeListener((ev) => {
						session.id = ev.payload.session.id;
					});

					this.eventsub_ws.setCloseListener((ev) => {
						this.eventsub_ws_session = null;
					});

					res(session);
				});

				this.eventsub_ws.setCloseListener((ev) => {
					rej();
				});
			});

			this.eventsub_ws.connect();
		}

		try {
			const session = await this.eventsub_ws_session;
			return session;
		} catch {
			this.eventsub_ws_session = null;
			throw new Error("Could not establish EventSub websocket");
		}
	}

	public getTwitchId(): string {
		return this.twitch_id;
	}

	public getTwitchUName(): string {
		return this.twitch_uname;
	}

	public getTwitchDName(): string {
		return this.twitch_dname;
	}

	public setMessageListener(callback: (bot: TwitchBot, ev: MessageEvent) => void) {
		this.message_listener = callback;
	}

	public setStreamListener(callback: (bot: TwitchBot, ev: ChannelEvent) => void) {
		this.stream_listener = callback;
	}

	public setJoinListener(callback: (bot: TwitchBot, ev: ChannelEvent) => void) {
		this.join_listener = callback;
	}

	public setPartListener(callback: (bot: TwitchBot, ev: ChannelEvent) => void) {
		this.part_listener = callback;
	}

	public setFaultListener(callback: (bot: TwitchBot) => void) {
		this.fault_listener = callback;
	}

	private async messageSendNow(channel_id: string, message: string, reply_to_message_id?: string): Promise<boolean> {
		let auth: TwitchBotAuth;
		try {
			auth = await this.getAuth();
		} catch {
			this.setFaulty();
			this.fault_listener(this);
			return false;
		}

		try {
			const res = await Helix.sendChatMessage(auth, {
				broadcaster_id: channel_id,
				sender_id: this.twitch_id,
				message: message,
				reply_parent_message_id: reply_to_message_id,
			});

			if (!res.data.is_sent) {
				return false;
			}

			return true;
		} catch {
			return false;
		}
	}

	private async messageSendQueue() {
		while (true) {
			const message = this.message_queue.shift();

			if (message) {
				if (this.messages_sent >= GLOBAL_MESSAGES_PER_30S) {
					setTimeout(() => {
						this.messages_sent = 0;
						this.messageSendQueue();
					}, 1000 * 30);
					break;
				}

				this.messages_sent++;
				const res = await this.messageSendNow(message.channel_id, message.message, message.reply_to_message_id);
				message.resolve(res);

				// Sleep 1 second.
				await new Promise((res, rej) => setTimeout(res, 1000 * (1 / CHANNEL_MESSAGES_PER_1S)));
			} else {
				this.messages_in_queue = false;
				break;
			}
		}
	}

	private message(channel_id: string, message: string, reply_to_message_id?: string): Promise<boolean> {
		const { promise, resolve, reject } = Promise.withResolvers<boolean>();

		this.message_queue.push({
			channel_id: channel_id,
			message: message,
			reply_to_message_id: reply_to_message_id,
			resolve: resolve,
		});

		if (!this.messages_in_queue) {
			this.messages_in_queue = true;
			this.messageSendQueue();
		}

		return promise;
	}

	private async createJoin(auth: TwitchBotAuth, channel_id: string): Promise<TwitchBotJoin> {
		const [users, streams] = await Promise.all([
			Helix.getUsers(auth, {
				ids: [channel_id],
			}),
			Helix.getStreams(auth, {
				user_id: channel_id,
			}),
		]);

		const is_online = streams.data.length !== 0;
		const channel = users.data[0];
		if (!channel) {
			throw new Error("Failed to get channel information");
		}

		return {
			twitch_id: channel_id,
			twitch_uname: channel.login,
			twitch_dname: channel.display_name,
			is_online: is_online,
			eventsub_ids: [],
		};
	}

	private async createJoinEventSubs(auth: TwitchBotAuth, join: TwitchBotJoin, session: EventSubWebSocketSession) {
		const eventsubs = await Promise.allSettled([
			EventSub.channelChatMessage(auth, {
				condition: { broadcaster_user_id: join.twitch_id, user_id: this.twitch_id },
				transport: { method: "websocket", session_id: session.id },
			}),
			EventSub.streamOnline(auth, {
				condition: { broadcaster_user_id: join.twitch_id },
				transport: { method: "websocket", session_id: session.id },
			}),
			EventSub.streamOffline(auth, {
				condition: { broadcaster_user_id: join.twitch_id },
				transport: { method: "websocket", session_id: session.id },
			}),
		]);

		// True if any of the above EventSubs get rejected.
		// If true delete all successful EventSubs after inserting them into the relevent join.
		let failed = false;

		eventsubs.forEach((result) => {
			if (result.status === "fulfilled") {
				const eventsub = result.value;
				session.total = eventsub.total;
				session.total_cost = eventsub.total_cost;
				session.total_max_cost = eventsub.max_total_cost;
				join.eventsub_ids.push(eventsub.data[0].id);
			} else {
				failed = true;
			}
		});

		if (failed) {
			await this.deleteJoinEventSubs(auth, join, session);
			throw new Error("Could not create all nessesery EventSubs for a bot join.");
		}
	}

	private async deleteJoinEventSubs(auth: TwitchBotAuth, join: TwitchBotJoin, session: EventSubWebSocketSession) {
		const promises = join.eventsub_ids.map((id) => {
			return Helix.deleteEventSub(auth, { id: id });
		});

		await Promise.allSettled(promises);
		const eventsubs = await Helix.getEventSubs(auth, {});

		session.total = eventsubs.total;
		session.total_cost = eventsubs.total_cost;
		session.total_max_cost = eventsubs.max_total_cost;
	}

	public async join(channel_id: string): Promise<boolean> {
		if (this.joins.get(channel_id)) {
			// Already joined, no need to duplicate EventSub subs
			return false;
		}

		let session: EventSubWebSocketSession;
		let auth: TwitchBotAuth;
		try {
			session = await this.getEventSubSession();
			auth = await this.getAuth();
		} catch {
			this.setFaulty();
			this.fault_listener(this);
			return false;
		}

		try {
			const join = await this.createJoin(auth, channel_id);
			await this.createJoinEventSubs(auth, join, session);

			this.joins.set(channel_id, join);
			this.join_listener(this, {
				origin: "twitch",
				status: join.is_online ? "live" : "offline",
				channel_id: channel_id,
				channel_uname: join.twitch_uname,
				channel_dname: join.twitch_dname,
			});

			return true;
		} catch {
			return false;
		}
	}

	public async part(channel_id: string): Promise<boolean> {
		const join = this.joins.get(channel_id);
		if (!join) {
			// Not joined, skip and return false.
			return false;
		}

		let session: EventSubWebSocketSession;
		let auth: TwitchBotAuth;
		try {
			session = await this.getEventSubSession();
			auth = await this.getAuth();
		} catch {
			this.setFaulty();
			this.fault_listener(this);
			return false;
		}

		try {
			await this.deleteJoinEventSubs(auth, join, session);
			this.joins.delete(channel_id);

			this.part_listener(this, {
				origin: "twitch",
				status: join.is_online ? "live" : "offline",
				channel_id: channel_id,
				channel_uname: join.twitch_uname,
				channel_dname: join.twitch_dname,
			});

			if (this.joins.size === 0) {
				this.eventsub_ws.close();
			}

			return true;
		} catch {
			return false;
		}
	}

	public getPluginBot(): PluginBot {
		return {
			origin_id: this.twitch_id,
			origin_uname: this.twitch_uname,
			origin_dname: this.twitch_dname,

			originAuthToken: async () => {
				try {
					const auth = await this.getAuth();
					return auth.token();
				} catch {
					this.setFaulty();
					this.fault_listener(this);
					throw new Error("Could not obtain auth token");
				}
			},

			message: async (channel_id: string, message: string, reply_to_message_id?: string) => {
				return await this.message(channel_id, message, reply_to_message_id);
			},

			join: async (channel_id: string) => {
				return await this.join(channel_id);
			},

			part: async (channel_id: string) => {
				return await this.part(channel_id);
			},
		};
	}

	public close() {
		this.eventsub_ws.close();
	}
}
