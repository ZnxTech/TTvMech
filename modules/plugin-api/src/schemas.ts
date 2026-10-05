import Z from "zod";

export const EVENT_SCHEMA = Z.object({
	origin: Z.enum(["twitch", "youtube", "kick"]),
});

export const MESSAGE_EVENT_SCHEMA = EVENT_SCHEMA.extend({
	text: Z.string(),
	message_id: Z.string(),
	chatter_id: Z.string(),
	chatter_uname: Z.string(),
	chatter_dname: Z.string(),
	channel_id: Z.string(),
	channel_uname: Z.string(),
	channel_dname: Z.string(),
});

export const CHANNEL_EVENT_SCHEMA = EVENT_SCHEMA.extend({
	status: Z.enum(["live", "offline"]),
	channel_id: Z.string(),
	channel_uname: Z.string(),
	channel_dname: Z.string(),
});

export const PLUGIN_BOT_SCHEMA = Z.object({
	origin_id: Z.string(),
	origin_uname: Z.string(),
	origin_dname: Z.string(),

	originAuthToken: Z.function({
		input: [],
		output: Z.promise(Z.string()),
	}),

	message: Z.function({
		input: [Z.string(), Z.string(), Z.string().optional()],
		output: Z.promise(Z.boolean()),
	}),

	join: Z.function({
		input: [Z.string()],
		output: Z.promise(Z.boolean()),
	}),

	part: Z.function({
		input: [Z.string()],
		output: Z.promise(Z.boolean()),
	}),
});

export const PLUGIN_STATE_SCHEMA = Z.object({
	getTwitchAppAuth: Z.function({
		input: [],
		output: Z.promise(Z.string()),
	}),

	getYoutubeAppAuth: Z.function({
		input: [],
		output: Z.promise(Z.string()),
	}),

	getKickAppAuth: Z.function({
		input: [],
		output: Z.promise(Z.string()),
	}),
});

export const PLUGIN_SCHEMA = Z.object({
	name: Z.string(),
	version: Z.string(),

	onLoad: Z.function().optional(),
	onEnable: Z.function().optional(),
	onDisable: Z.function().optional(),
	onMessage: Z.function().optional(),
	onStream: Z.function().optional(),
	onJoin: Z.function().optional(),
	onPart: Z.function().optional(),
});
