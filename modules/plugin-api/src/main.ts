export interface Event {
	// event_id: string,
	origin: "twitch" | "youtube" | "kick";
}

export interface MessageEvent extends Event {
	text: string;
	message_id: string;
	chatter_id: string;
	chatter_uname: string;
	chatter_dname: string;
	channel_id: string;
	channel_uname: string;
	channel_dname: string;
}

export interface ChannelEvent extends Event {
	status: "live" | "offline";
	channel_id: string;
	channel_uname: string;
	channel_dname: string;
}

export interface PluginBot {
	origin_id: string;
	origin_uname: string;
	origin_dname: string;

	originAuthToken(): Promise<string>;

	message(channel_id: string, message: string, reply_to_message_id?: string): Promise<boolean>;

	join(channel_id: string): Promise<boolean>;

	part(channel_id: string): Promise<boolean>;
}

export interface PluginState {
	getTwitchAppAuth(): Promise<string>;
	getYoutubeAppAuth(): Promise<string>;
	getKickAppAuth(): Promise<string>;
}

export interface Plugin {
	name: string;
	version: string;

	onLoad?(state: PluginState): void;
	onEnable?(state: PluginState): void;
	onDisable?(state: PluginState): void;
	onMessage?(state: PluginState, bot: PluginBot, message: MessageEvent): void;
	onStream?(state: PluginState, bot: PluginBot, channel: ChannelEvent): void;
	onJoin?(state: PluginState, bot: PluginBot, channel: ChannelEvent): void;
	onPart?(state: PluginState, bot: PluginBot, channel: ChannelEvent): void;
}

export function plugin(opt: Plugin): Plugin {
	return opt;
}
