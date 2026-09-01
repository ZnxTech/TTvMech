import { eq } from "drizzle-orm";
import Z from "zod";

import { BotAuth, Helix, EventSub } from "@ttvmech/twitch-api";
import { EventSubWebSocket, EventSubWebSocketSession } from "@ttvmech/twitch-api/eventsub";
import { EventSubSchemas } from "@ttvmech/twitch-api/schemas";

import { db } from "./db.js";
import { tables } from "./db_schema.js";
import { Bot } from "./commands.js";

const MESSAGES_PER_30S = 20;
const MESSAGES_PER_30S_MODDED = 100;

interface BotJoin {
	is_online: boolean;
	is_offline_only: boolean;
	eventsub_subs: string[];
}

export class TwitchBot extends Bot {
	private auth: BotAuth;
	private twitch_id: string;

	private eventsub_ws: EventSubWebSocket;
	private eventsub_ws_session: EventSubWebSocketSession | null;

	private joins: Map<string, BotJoin>;

	private message_listener: (bot: TwitchBot, message: Z.infer<typeof EventSubSchemas.CHANNEL_CHAT_MESSAGE>) => void =
		() => {};
	private error_listener: (bot: TwitchBot, error: Error) => void = () => {};

	constructor(auth: BotAuth, twitch_id: string) {
		super();
		this.auth = auth;
		this.twitch_id = twitch_id;
		this.eventsub_ws = new EventSubWebSocket();
		this.eventsub_ws_session = null;
		this.joins = new Map();

		this.eventsub_ws.addEventListener("channel.chat.message", (ev) => {
			const message = EventSubSchemas.CHANNEL_CHAT_MESSAGE.safeParse(ev);

			if (message.success) {
				const join = this.joins.get(message.data.broadcaster_user_id);
				if (join === undefined) {
					// Recived message from a channel that the bot did not join to, ignore.
					return;
				}

				if (join.is_offline_only && join.is_online) {
					// Dont proccess message if the channel is online/live and is set to offline only.
					return;
				}

				this.message_listener(this, message.data);
			}
		});

		this.eventsub_ws.addEventListener("stream.online", (ev) => {
			const online = EventSubSchemas.STREAM_ONLINE.safeParse(ev);

			if (online.success) {
				const join = this.joins.get(online.data.broadcaster_user_id);
				if (join !== undefined) {
					join.is_online = true;
				}
			}
		});

		this.eventsub_ws.addEventListener("stream.offline", (ev) => {
			const offline = EventSubSchemas.STREAM_OFFLINE.safeParse(ev);

			if (offline.success) {
				const join = this.joins.get(offline.data.broadcaster_user_id);
				if (join !== undefined) {
					join.is_online = false;
				}
			}
		});
	}

	private async getAuth(): Promise<BotAuth> {
		if (this.auth.expired()) {
			const settings = db
				.select({
					client_secret: tables.settings.twitch_client_secret,
				})
				.from(tables.settings)
				.where(eq(tables.settings.id, 0))
				.get();

			if (settings === undefined || settings.client_secret === null) {
				throw new Error("Failed to obtain client secret");
			}

			await this.auth.refresh(settings.client_secret);
		}

		return this.auth;
	}

	private async getEventSubSession(): Promise<EventSubWebSocketSession> {
		if (this.eventsub_ws_session !== null) {
			return this.eventsub_ws_session;
		}

		const eventsub_ws_id = await new Promise<string>((res, rej) => {
			this.eventsub_ws.setWelcomeListener((ev) => {
				res(ev.payload.session.id);
			});

			this.eventsub_ws.setCloseListener((ev) => {
				rej();
			});

			this.eventsub_ws.connect();
		});

		const auth = await this.getAuth();
		const eventsub_status = await Helix.getEventSubs(auth, {});

		this.eventsub_ws_session = {
			id: eventsub_ws_id,
			total: eventsub_status.total,
			total_cost: eventsub_status.total_cost,
			total_max_cost: eventsub_status.max_total_cost,
		};

		return this.eventsub_ws_session;
	}

	public setMessageListener(
		callback: (bot: TwitchBot, message: Z.infer<typeof EventSubSchemas.CHANNEL_CHAT_MESSAGE>) => void
	) {
		this.message_listener = callback;
	}

	public setErrorListener(callback: (bot: TwitchBot, error: Error) => void) {
		this.error_listener = callback;
	}

	public async message(broadcaster_id: string, message: string) {
		try {
			const auth = await this.getAuth();

			const res = await Helix.sendChatMessage(auth, {
				broadcaster_id: broadcaster_id,
				sender_id: this.twitch_id,
				message: message,
			});

			if (!res.data.is_sent) {
				const code = res.data.drop_reason.code;
				const message = res.data.drop_reason.message;
				throw new Error(`Message was not sent, (${code}) ${message}`);
			}
		} catch {
			this.error_listener(this, new Error("Failed to send message"));
		}
	}

	public async join(broadcaster_id: string, offline_only: boolean) {
		if (this.joins.get(broadcaster_id) !== undefined) {
			// Already joined, no need to duplicate EventSub subs
			return;
		}

		try {
			const session = await this.getEventSubSession();
			const auth = await this.getAuth();
			const join: BotJoin = {
				is_online: true,
				is_offline_only: offline_only,
				eventsub_subs: [],
			};

			this.joins.set(broadcaster_id, join);

			const subs = await Promise.all([
				EventSub.channelChatMessage(auth, {
					condition: { broadcaster_user_id: broadcaster_id, user_id: this.twitch_id },
					transport: { method: "websocket", session_id: session.id },
				}),
				EventSub.streamOnline(auth, {
					condition: { broadcaster_user_id: broadcaster_id },
					transport: { method: "websocket", session_id: session.id },
				}),
				EventSub.streamOffline(auth, {
					condition: { broadcaster_user_id: broadcaster_id },
					transport: { method: "websocket", session_id: session.id },
				}),
			]);

			for (const sub of subs) {
				session.total = sub.total;
				session.total_cost = sub.total_cost;
				session.total_max_cost = sub.max_total_cost;
				join.eventsub_subs.push(sub.data[0].id);
			}
		} catch {
			this.error_listener(this, new Error(`Failed to join Twitch channel ${broadcaster_id}`));
		}
	}

	public async part(broadcaster_id: string) {
		try {
			const join = this.joins.get(broadcaster_id);
			if (join === undefined) {
				return;
			}

			const auth = await this.getAuth();
			await Promise.all(
				join.eventsub_subs.map((sub) => {
					return Helix.deleteEventSub(auth, { id: sub });
				})
			);

			const session = await this.getEventSubSession();
			const eventsub_status = await Helix.getEventSubs(await this.getAuth(), {});
			session.total = eventsub_status.total;
			session.total_cost = eventsub_status.total_cost;
			session.total_max_cost = eventsub_status.max_total_cost;

			this.joins.delete(broadcaster_id);
		} catch {
			this.error_listener(this, new Error(`Failed to part Twitch channel ${broadcaster_id}`));
		}
	}

	public close() {
		this.eventsub_ws.close();
	}
}
