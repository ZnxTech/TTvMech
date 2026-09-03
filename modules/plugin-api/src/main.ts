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

export abstract class PluginBot {
	public abstract getUName(): string;
	public abstract getDName(): string;
	public abstract getOriginId(): string;
	public abstract getOriginAuth(): Promise<string>;

	public abstract message(channel_id: string, message: string, reply_to_message_id?: string): Promise<boolean>;

	public abstract join(channel_id: string): Promise<boolean>;

	public abstract part(channel_id: string): Promise<boolean>;
}

export interface PluginState {
	getTwitchAppAuth: () => Promise<string>;
	getYoutubeAppAuth: () => Promise<string>;
	getKickAppAuth: () => Promise<string>;
}

export interface Plugin {
	name: string;
	version: string;

	on_load?: (state: PluginState) => void;
	on_enable?: (state: PluginState) => void;
	on_disable?: (state: PluginState) => void;
	on_message?: (state: PluginState, bot: PluginBot, message: MessageEvent) => void;
	on_stream?: (state: PluginState, bot: PluginBot, channel: ChannelEvent) => void;
	on_join?: (state: PluginState, bot: PluginBot, channel: ChannelEvent) => void;
	on_part?: (state: PluginState, bot: PluginBot, channel: ChannelEvent) => void;
}

export function plugin(opt: Plugin): Plugin {
	return opt;
}
