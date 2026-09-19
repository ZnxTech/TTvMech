import Z from "zod";

import { APISchemas, AuthSchemas } from "./schemas.js";

export class Auth {
	protected constructor(
		protected client_id: string,
		protected access_token: string,
		protected expires_at: Date
	) {}

	public clientId(): string {
		return this.client_id;
	}

	public token(): string {
		return this.access_token;
	}

	public expired(): boolean {
		return this.expires_at <= new Date();
	}

	public expiresAt(): Date {
		return new Date(this.expires_at);
	}

	public expiresIn(): number {
		return this.expires_at.getTime();
	}

	public async validate(): Promise<Z.infer<typeof AuthSchemas.AUTH_VALIDATE>> {
		const res = await fetch("https://id.twitch.tv/oauth2/validate", {
			method: "GET",
			headers: { Authorization: `OAuth ${this.access_token}` },
		});

		if (!res.ok) {
			throw new Error("Failed to validate auth token");
		}

		const json = AuthSchemas.AUTH_VALIDATE.safeParse(await res.json());
		if (json.success) {
			return json.data;
		} else {
			throw new Error("Invalid validation json recived");
		}
	}

	public async revoke() {
		const res = await fetch("https://id.twitch.tv/oauth2/revoke", {
			method: "POST",
			body: new URLSearchParams({
				client_id: this.client_id,
				token: this.access_token,
			}),
		});

		if (!res.ok) {
			throw new Error("Failed to revoke auth token");
		}
	}
}

export class AppAuth extends Auth {
	private constructor(client_id: string, access_token: string, expires_at: Date) {
		super(client_id, access_token, expires_at);
	}

	static async request(client_id: string, client_secret: string): Promise<AppAuth> {
		const res = await fetch("https://id.twitch.tv/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				client_id: client_id,
				client_secret: client_secret,
				grant_type: "client_credentials",
			}),
		});

		if (!res.ok) {
			throw new Error("Failed to request auth token");
		}

		const json = AuthSchemas.AUTH_APP.safeParse(await res.json());
		if (json.success) {
			const expires_at = new Date(Date.now() + json.data.expires_in * 1000);
			return new AppAuth(client_id, json.data.access_token, expires_at);
		} else {
			throw new Error("Invalid app auth json recived");
		}
	}
}

export class BotAuth extends Auth {
	public constructor(
		client_id: string,
		access_token: string,
		private refresh_token: string,
		private scopes: string[],
		expires_at: Date
	) {
		super(client_id, access_token, expires_at);
	}

	public refreshToken(): string {
		return this.refresh_token;
	}

	public scope(): string[] {
		return [...this.scopes];
	}

	static async request(
		client_id: string,
		client_secret: string,
		access_code: string,
		redirect_uri: string
	): Promise<BotAuth> {
		const res = await fetch("https://id.twitch.tv/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				client_id: client_id,
				client_secret: client_secret,
				grant_type: "authorization_code",
				code: access_code,
				redirect_uri: redirect_uri,
			}),
		});

		if (!res.ok) {
			throw new Error("Failed to request auth token");
		}

		const json = AuthSchemas.AUTH_BOT.safeParse(await res.json());
		if (json.success) {
			const expires_at = new Date(Date.now() + json.data.expires_in * 1000);
			return new BotAuth(client_id, json.data.access_token, json.data.refresh_token, json.data.scope, expires_at);
		} else {
			throw new Error("Invalid app auth json recived");
		}
	}

	async refresh(client_secret: string) {
		const res = await fetch("https://id.twitch.tv/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				client_id: this.client_id,
				client_secret: client_secret,
				grant_type: "refresh_token",
				refresh_token: this.refresh_token,
			}),
		});

		if (!res.ok) {
			throw new Error("Failed to refresh auth token");
		}

		const json = AuthSchemas.AUTH_REFRESH.safeParse(await res.json());
		if (json.success) {
			const expires_at = new Date(Date.now() + json.data.expires_in * 1000);

			this.access_token = json.data.access_token;
			this.refresh_token = json.data.refresh_token;
			this.scopes = json.data.scope;
			this.expires_at = expires_at;
		} else {
			throw new Error("Invalid refresh json recived");
		}
	}
}

export namespace Helix {
	// Ref: https://dev.twitch.tv/docs/api/reference/#send-chat-message
	export async function sendChatMessage<A extends Auth>(
		auth: A,
		data: {
			broadcaster_id: string;
			sender_id: string;
			message: string;
			reply_parent_message_id?: string;
			for_source_only?: boolean;
			pin?: boolean;
		}
	): Promise<Z.infer<typeof APISchemas.SEND_CHAT_MESSAGE>> {
		const res = await fetch("https://api.twitch.tv/helix/chat/messages", {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${auth.token()}`,
				"Client-Id": auth.clientId(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		});

		if (!res.ok) {
			throw new Error("Failed to send chat message");
		}

		const json = APISchemas.SEND_CHAT_MESSAGE.safeParse(await res.json());
		if (json.success) {
			return json.data;
		} else {
			throw new Error("Invalid send chat message json recived");
		}
	}

	interface EventSubTransportWebSocket {
		method: "websocket";
		session_id: string;
	}

	interface EventSubTransportWebHook {
		method: "webhook";
		callback: string;
		secret: string;
	}

	interface EventSubTransportConduit {
		method: "conduit";
		conduit_id: string;
	}

	export type EventSubTransport = EventSubTransportWebSocket | EventSubTransportWebHook | EventSubTransportConduit;

	// Ref: https://dev.twitch.tv/docs/api/reference/#create-eventsub-subscription
	export async function createEventSub<A extends Auth>(
		auth: A,
		data: {
			type: string;
			version: string;
			condition: any;
			transport: EventSubTransport;
		}
	): Promise<Z.infer<typeof APISchemas.CREATE_EVENTSUB>> {
		const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${auth.token()}`,
				"Client-Id": auth.clientId(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		});

		if (!res.ok) {
			throw new Error("Failed to create an EventSub");
		}

		const json = APISchemas.CREATE_EVENTSUB.safeParse(await res.json());
		if (json.success) {
			return json.data;
		} else {
			throw new Error("Invalid EventSub json recived");
		}
	}

	// Ref: https://dev.twitch.tv/docs/api/reference/#delete-eventsub-subscription
	export async function deleteEventSub<A extends Auth>(
		auth: A,
		data: {
			id: string;
		}
	) {
		const url = new URL("https://api.twitch.tv/helix/eventsub/subscriptions");
		url.searchParams.append("id", data.id);

		const res = await fetch(url, {
			method: "DELETE",
			headers: {
				"Authorization": `Bearer ${auth.token()}`,
				"Client-Id": auth.clientId(),
			},
		});

		if (!res.ok) {
			throw new Error("Failed to delete an EventSub");
		}
	}

	// Ref: https://dev.twitch.tv/docs/api/reference/#get-eventsub-subscriptions
	export async function getEventSubs<A extends Auth>(
		auth: A,
		data: {
			type?: string;
			user_id?: string;
			subscription_id?: string;
			conduit_id?: string;
			after?: string;
		}
	): Promise<Z.infer<typeof APISchemas.GET_EVENTSUB>> {
		const res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${auth.token()}`,
				"Client-Id": auth.clientId(),
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		});

		if (!res.ok) {
			throw new Error("Failed to get EventSubs");
		}

		const json = APISchemas.GET_EVENTSUB.safeParse(await res.json());
		if (json.success) {
			return json.data;
		} else {
			throw new Error("Invalid EventSub json recived");
		}
	}

	// Ref: https://dev.twitch.tv/docs/api/reference/#get-streams
	export async function getStreams<A extends Auth>(
		auth: A,
		data: {
			user_id?: string;
			user_login?: string;
			game_id?: string;
			type?: "all" | "live";
			language?: string;
			first?: number;
			before?: string;
			after?: string;
		}
	): Promise<Z.infer<typeof APISchemas.GET_STREAMS>> {
		const url = new URL("https://api.twitch.tv/helix/streams");
		Object.entries(data).forEach(([key, val]) => {
			url.searchParams.append(key, String(val));
		});

		const res = await fetch(url, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${auth.token()}`,
				"Client-Id": auth.clientId(),
			},
		});

		if (!res.ok) {
			throw new Error("Failed to get users");
		}

		const json = APISchemas.GET_STREAMS.safeParse(await res.json());
		if (json.success) {
			return json.data;
		} else {
			throw new Error("Invalid users json recived");
		}
	}

	// Ref: https://dev.twitch.tv/docs/api/reference/#get-users
	export async function getUsers<A extends Auth>(
		auth: A,
		data: {
			ids?: string[];
			logins?: string[];
		}
	): Promise<Z.infer<typeof APISchemas.GET_USERS>> {
		const url = new URL("https://api.twitch.tv/helix/users");
		data.ids?.forEach((id) => url.searchParams.append("id", id));
		data.logins?.forEach((login) => url.searchParams.append("login", login));

		const res = await fetch(url, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${auth.token()}`,
				"Client-Id": auth.clientId(),
			},
		});

		if (!res.ok) {
			throw new Error("Failed to get users");
		}

		const body = await res.json();

		const json = APISchemas.GET_USERS.safeParse(body);
		if (json.success) {
			return json.data;
		} else {
			console.log(json.error.message, body);
			throw new Error("Invalid users json recived");
		}
	}
}

export namespace EventSub {
	export async function channelUpdate<A extends Auth>(
		auth: A,
		data: {
			condition: {
				broadcaster_user_id: string;
			};
			transport: Helix.EventSubTransport;
		}
	): Promise<Z.infer<typeof APISchemas.CREATE_EVENTSUB>> {
		return await Helix.createEventSub(auth, {
			type: "channel.update",
			version: "2",
			condition: data.condition,
			transport: data.transport,
		});
	}

	export async function channelChatMessage<A extends Auth>(
		auth: A,
		data: {
			condition: {
				broadcaster_user_id: string;
				user_id: string;
			};
			transport: Helix.EventSubTransport;
		}
	): Promise<Z.infer<typeof APISchemas.CREATE_EVENTSUB>> {
		return await Helix.createEventSub(auth, {
			type: "channel.chat.message",
			version: "1",
			condition: data.condition,
			transport: data.transport,
		});
	}

	export async function streamOnline<A extends Auth>(
		auth: A,
		data: {
			condition: {
				broadcaster_user_id: string;
			};
			transport: Helix.EventSubTransport;
		}
	): Promise<Z.infer<typeof APISchemas.CREATE_EVENTSUB>> {
		return await Helix.createEventSub(auth, {
			type: "stream.online",
			version: "1",
			condition: data.condition,
			transport: data.transport,
		});
	}

	export async function streamOffline<A extends Auth>(
		auth: A,
		data: {
			condition: {
				broadcaster_user_id: string;
			};
			transport: Helix.EventSubTransport;
		}
	): Promise<Z.infer<typeof APISchemas.CREATE_EVENTSUB>> {
		return await Helix.createEventSub(auth, {
			type: "stream.offline",
			version: "1",
			condition: data.condition,
			transport: data.transport,
		});
	}

	export async function userWhisperRecived<A extends Auth>(
		auth: A,
		data: {
			condition: {
				user_id: string;
			};
			transport: Helix.EventSubTransport;
		}
	): Promise<Z.infer<typeof APISchemas.CREATE_EVENTSUB>> {
		return await Helix.createEventSub(auth, {
			type: "user.whisper.message",
			version: "1",
			condition: data.condition,
			transport: data.transport,
		});
	}
}
