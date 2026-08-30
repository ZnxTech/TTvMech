import Z from "zod";

export namespace AuthSchemas {
	export const AUTH_APP = Z.object({
		access_token: Z.string(),
		expires_in: Z.number(),
		token_type: Z.literal("bearer"),
	});

	export const AUTH_BOT = Z.object({
		access_token: Z.string(),
		expires_in: Z.number(),
		refresh_token: Z.string(),
		scope: Z.string().array(),
		token_type: Z.literal("bearer"),
	});

	export const AUTH_REFRESH = Z.object({
		access_token: Z.string(),
		expires_in: Z.number(),
		refresh_token: Z.string(),
		scope: Z.string().array(),
		token_type: Z.literal("bearer"),
	});

	export const AUTH_VALIDATE = Z.object({
		client_id: Z.string(),
		login: Z.string(),
		scopes: Z.string().array(),
		user_id: Z.string(),
		expires_in: Z.number(),
	});
}

export namespace APISchemas {
	const SEND_CHAT_MESSAGE_OK = Z.object({
		message_id: Z.string(),
		is_sent: Z.literal(true),
	});

	const SEND_CHAT_MESSAGE_ERR = Z.object({
		message_id: Z.string(),
		is_sent: Z.literal(false),
		drop_reason: Z.object({
			code: Z.string(),
			message: Z.string(),
		}),
	});

	export const SEND_CHAT_MESSAGE = Z.object({
		data: Z.xor([SEND_CHAT_MESSAGE_OK, SEND_CHAT_MESSAGE_ERR]),
	});

	const EVENTSUB_TRANSPORT_WEBSOCKET = Z.object({
		method: Z.literal("websocket"),
		session_id: Z.string(),
		connected_at: Z.iso.datetime(),
	});

	const EVENTSUB_TRANSPORT_WEBHOOK = Z.object({
		method: Z.literal("webhook"),
		callback: Z.url(),
	});

	const EVENTSUB_TRANSPORT_CONDUIT = Z.object({
		method: Z.literal("conduit"),
		conduit_id: Z.string(),
	});

	const EVENTSUB_TRANSPORT = Z.xor([
		EVENTSUB_TRANSPORT_WEBSOCKET,
		EVENTSUB_TRANSPORT_WEBHOOK,
		EVENTSUB_TRANSPORT_CONDUIT,
	]);

	const CREATE_EVENTSUB_SUB = Z.object({
		id: Z.string(),
		status: Z.enum(["enabled", "webhook_callback_verification_pending"]),
		type: Z.string(),
		version: Z.string(),
		condition: Z.unknown(),
		created_at: Z.iso.datetime(),
		transport: EVENTSUB_TRANSPORT,
		cost: Z.number(),
	});

	export const CREATE_EVENTSUB = Z.object({
		data: Z.tuple([CREATE_EVENTSUB_SUB]),
		total: Z.number(),
		total_cost: Z.number(),
		max_total_cost: Z.number(),
	});

	const GET_EVENTSUB_SUB = Z.object({
		id: Z.string(),
		status: Z.enum([
			"enabled",
			"webhook_callback_verification_pending",
			"webhook_callback_verification_failed",
			"notification_failures_exceeded",
			"authorization_revoked",
			"moderator_removed",
			"user_removed",
			"chat_user_banned",
			"beta_maintenance",
			"websocket_disconnected",
			"websocket_failed_ping_pong",
			"websocket_received_inbound_traffic",
			"websocket_connection_unused",
			"websocket_internal_error",
			"websocket_network_timeout",
			"websocket_network_error",
		]),
		type: Z.string(),
		version: Z.string(),
		condition: Z.unknown(),
		created_at: Z.iso.datetime(),
		transport: EVENTSUB_TRANSPORT,
		cost: Z.number(),
	});

	export const GET_EVENTSUB = Z.object({
		data: GET_EVENTSUB_SUB.array(),
		total: Z.number(),
		total_cost: Z.number(),
		max_total_cost: Z.number(),
		pagination: Z.object({
			cursor: Z.string().optional(),
		}),
	});

	const GET_USERS_USER = Z.object({
		id: Z.string(),
		login: Z.string(),
		display_name: Z.string(),
		type: Z.enum(["admin", "global_mod", "staff", ""]),
		broadcaster_type: Z.enum(["affiliate", "partner", ""]),
		description: Z.string(),
		profile_image_url: Z.url(),
		offline_image_url: Z.url(),
		view_count: Z.number(),
		email: Z.string().optional(),
		created_at: Z.iso.datetime(),
	});

	export const GET_USERS = Z.object({
		data: GET_USERS_USER.array(),
	});
}

export namespace WebSocketSchemas {
	export const META = Z.object({
		metadata: Z.object({
			message_id: Z.string(),
			message_type: Z.enum([
				"session_welcome",
				"session_keepalive",
				"notification",
				"session_reconnect",
				"revocation",
			]),
			message_timestamp: Z.iso.datetime(),
		}),
	});

	export const WELCOME = Z.object({
		metadata: Z.object({
			message_id: Z.string(),
			message_type: Z.literal("session_welcome"),
			message_timestamp: Z.iso.datetime(),
		}),
		payload: Z.object({
			session: Z.object({
				id: Z.string(),
				status: Z.literal("connected"),
				keepalive_timeout_seconds: Z.int(),
				reconnect_url: Z.null(),
				connected_at: Z.string(),
			}),
		}),
	});

	export const KEEPALIVE = Z.object({
		metadata: Z.object({
			message_id: Z.string(),
			message_type: Z.literal("session_keepalive"),
			message_timestamp: Z.iso.datetime(),
		}),
		payload: Z.object({}),
	});

	export const NOTIFICATION = Z.object({
		metadata: Z.object({
			message_id: Z.string(),
			message_type: Z.literal("notification"),
			message_timestamp: Z.iso.datetime(),
			subscription_type: Z.string(),
			subscription_version: Z.string(),
		}),
		payload: Z.object({
			subscription: Z.object({
				id: Z.string(),
				status: Z.literal("enabled"),
				type: Z.string(),
				version: Z.string(),
				cost: Z.int(),
				connected_at: Z.string(),
			}),
			event: Z.unknown(),
		}),
	});

	export const RECONNECT = Z.object({
		metadata: Z.object({
			message_id: Z.string(),
			message_type: Z.literal("session_reconnect"),
			message_timestamp: Z.iso.datetime(),
		}),
		payload: Z.object({
			session: Z.object({
				id: Z.string(),
				status: Z.literal("reconnecting"),
				keepalive_timeout_seconds: Z.null(),
				reconnect_url: Z.url(),
				connected_at: Z.string(),
			}),
		}),
	});

	export const REVOCATION = Z.object({
		metadata: Z.object({
			message_id: Z.string(),
			message_type: Z.literal("revocation"),
			message_timestamp: Z.iso.datetime(),
			subscription_type: Z.string(),
			subscription_version: Z.string(),
		}),
		payload: Z.object({
			subscription: Z.object({
				id: Z.string(),
				status: Z.enum(["authorization_revoked", "user_removed", "version_removed"]),
				type: Z.string(),
				version: Z.string(),
				cost: Z.int(),
				connected_at: Z.string(),
			}),
		}),
	});
}

export namespace EventSubSchemas {
	const CHANNEL_CHAT_MESSAGE_FRAGMENT_TEXT = Z.object({
		type: Z.literal("text"),
		text: Z.string(),
		cheermote: Z.null(),
		emote: Z.null(),
		mention: Z.null(),
		gif: Z.null(),
	});

	const CHANNEL_CHAT_MESSAGE_FRAGMENT_CHEERMOTE = Z.object({
		type: Z.literal("cheermote"),
		text: Z.string(),
		cheermote: Z.object({
			prefix: Z.string(),
			bits: Z.int(),
			tier: Z.int(),
		}),
		emote: Z.null(),
		mention: Z.null(),
		gif: Z.null(),
	});

	const CHANNEL_CHAT_MESSAGE_FRAGMENT_EMOTE = Z.object({
		type: Z.literal("emote"),
		text: Z.string(),
		cheermote: Z.null(),
		emote: Z.object({
			id: Z.string(),
			emote_set_id: Z.string(),
			owner_id: Z.string(),
			format: Z.enum(["animated", "static"]).array(),
		}),
		mention: Z.null(),
		gif: Z.null(),
	});

	const CHANNEL_CHAT_MESSAGE_FRAGMENT_MENTION = Z.object({
		type: Z.literal("mention"),
		text: Z.string(),
		cheermote: Z.null(),
		emote: Z.null(),
		mention: Z.object({
			user_id: Z.string(),
			user_name: Z.string(),
			user_login: Z.string(),
		}),
		gif: Z.null(),
	});

	const CHANNEL_CHAT_MESSAGE_FRAGMENT_GIF = Z.object({
		type: Z.literal("gif"),
		text: Z.string(),
		cheermote: Z.null(),
		emote: Z.null(),
		mention: Z.null(),
		gif: Z.object({
			gif_id: Z.string(),
			url: Z.url(),
		}),
	});

	const CHANNEL_CHAT_MESSAGE_FRAGMENT = Z.discriminatedUnion("type", [
		CHANNEL_CHAT_MESSAGE_FRAGMENT_TEXT,
		CHANNEL_CHAT_MESSAGE_FRAGMENT_CHEERMOTE,
		CHANNEL_CHAT_MESSAGE_FRAGMENT_EMOTE,
		CHANNEL_CHAT_MESSAGE_FRAGMENT_MENTION,
		CHANNEL_CHAT_MESSAGE_FRAGMENT_GIF,
	]);

	export const CHANNEL_CHAT_MESSAGE = Z.object({
		broadcaster_user_id: Z.string(),
		broadcaster_user_name: Z.string(),
		broadcaster_user_login: Z.string(),
		chatter_user_id: Z.string(),
		chatter_user_name: Z.string(),
		chatter_user_login: Z.string(),
		message_id: Z.string(),
		message: Z.object({
			text: Z.string(),
			fragments: CHANNEL_CHAT_MESSAGE_FRAGMENT.array(),
		}),
		message_type: Z.enum([
			"text",
			"channel_points_highlighted",
			"channel_points_sub_only",
			"user_intro",
			"power_ups_message_effect",
			"power_ups_gigantified_emote",
		]),
		badges: Z.array(
			Z.object({
				set_id: Z.string(),
				id: Z.string(),
				info: Z.string(),
			})
		),
		cheer: Z.nullable(
			Z.object({
				bits: Z.int(),
			})
		),
		color: Z.string(),
		reply: Z.nullable(
			Z.object({
				parent_message_id: Z.string(),
				parent_message_body: Z.string(),
				parent_user_id: Z.string(),
				parent_user_name: Z.string(),
				parent_user_login: Z.string(),
				thread_message_id: Z.string(),
				thread_user_id: Z.string(),
				thread_user_name: Z.string(),
				thread_user_login: Z.string(),
			})
		),
		channel_points_custom_reward_id: Z.string().nullable(),
		source_broadcaster_user_id: Z.string().nullable(),
		source_broadcaster_user_name: Z.string().nullable(),
		source_broadcaster_user_login: Z.string().nullable(),
		source_message_id: Z.string().nullable(),
		source_badges: Z.nullable(
			Z.object({
				set_id: Z.string(),
				id: Z.string(),
				info: Z.string(),
			})
		),
		is_source_only: Z.boolean().optional(),
	});

	export const STREAM_ONLINE = Z.object({
		id: Z.string(),
		broadcaster_user_id: Z.string(),
		broadcaster_user_login: Z.string(),
		broadcaster_user_name: Z.string(),
		type: Z.enum(["live", "playlist", "watch_party", "premiere", "rerun"]),
		started_at: Z.iso.datetime(),
	});

	export const STREAM_OFFLINE = Z.object({
		id: Z.string(),
		broadcaster_user_id: Z.string(),
		broadcaster_user_login: Z.string(),
		broadcaster_user_name: Z.string(),
	});
}
