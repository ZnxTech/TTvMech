import { MessageEvent, PluginBot, PluginState } from "./main.js";

interface CommandCooldown {
	user_cooldowns: Map<string, Date>;
	chat_cooldowns: Map<string, Date>;
}

interface CommandArgs {
	trigger: string;
	pairs: { key: string; value: string | null }[];
	rest: string[];
	raw: string[];
}

type CommandEntryFn = (state: PluginState, bot: PluginBot, ev: MessageEvent, args: CommandArgs) => void;

interface CommandEntry {
	user_cooldown: number;
	chat_cooldown: number;
	callback: CommandEntryFn;
}

export class CommandBuilder {
	private commands: Map<string, CommandEntry>;
	private command_cooldowns: Map<string, CommandCooldown>;

	public constructor() {
		this.commands = new Map();
		this.command_cooldowns = new Map();
	}

	public handle(
		trigger: string,
		user_cooldown: number,
		chat_cooldown: number,
		callback: CommandEntryFn
	): CommandBuilder {
		this.commands.set(trigger, {
			user_cooldown: user_cooldown,
			chat_cooldown: chat_cooldown,
			callback: callback,
		});

		this.command_cooldowns.set(trigger, {
			user_cooldowns: new Map(),
			chat_cooldowns: new Map(),
		});

		return this;
	}

	private static parse(message: string, command_prefix: string): CommandArgs {
		const quotes = message.split(`"`);

		// Even splits means odd quotation mark count, therefore-
		// meaning there is a missing ending quotation mark.
		if (!(quotes.length % 2)) {
			throw new Error("");
		}

		const [first, ...rest] = quotes.map((quote, i) => (i % 2 ? quote : quote.trim().split(" "))).flat();

		if (!first) {
			throw new Error("Unexpected string change or parse error.");
		}

		const pairs = rest
			.map((token, i, arr) => ({ token, next: arr[i + 1] ?? null }))
			.filter(({ token }) => token.match(/^-{1,2}[a-zA-Z0-9\_\-]+(=.*)?$/))
			.map(({ token, next }) => {
				if (token.includes("=")) {
					const [token_key, ...token_values] = token.split("=");
					const token_value = token_values.join("=");

					if (!token_key) {
						throw new Error("Unexpected string change or parse error.");
					}

					// split always returns at least one element in this case.
					const key = token_key.replace(/^-{1,2}/, "");
					const value = token_value === "" ? next : (token_value ?? null);

					return { key, value: value?.match(/^-{1,2}[a-zA-Z0-9]+(=.*)?$/) ? null : value };
				} else {
					const key = token.replace(/^-{1,2}/, "");
					return { key, value: next };
				}
			});

		return {
			trigger: first.replace(command_prefix, ""),
			rest: rest,
			pairs: pairs,
			raw: [first, ...rest],
		};
	}

	public process(state: PluginState, bot: PluginBot, ev: MessageEvent) {
		const command_prefix = state.getCommandPrefix();
		const [prefixed_trigger] = ev.text.split(" ");

		if (prefixed_trigger && prefixed_trigger.startsWith(command_prefix)) {
			const trigger = prefixed_trigger.replace(command_prefix, "");
			const command = this.commands.get(trigger);
			const cooldowns = this.command_cooldowns.get(trigger);

			if (!command || !cooldowns) {
				return;
			}

			const user_id = `${ev.origin}:${ev.chatter_id}`;
			const chat_id = `${ev.origin}:${ev.channel_id}`;

			const user_cooldown = cooldowns.user_cooldowns.get(user_id);
			const chat_cooldown = cooldowns.chat_cooldowns.get(chat_id);

			if (user_cooldown && user_cooldown.getTime() > Date.now()) {
				return;
			}

			if (chat_cooldown && chat_cooldown.getTime() > Date.now()) {
				return;
			}

			const args = CommandBuilder.parse(ev.text, command_prefix);
			command.callback(state, bot, ev, args);

			if (command.user_cooldown > 0) {
				const cooldown = new Date(Date.now() + command.user_cooldown);
				cooldowns.user_cooldowns.set(user_id, cooldown);
			}

			if (command.chat_cooldown > 0) {
				const cooldown = new Date(Date.now() + command.chat_cooldown);
				cooldowns.chat_cooldowns.set(chat_id, cooldown);
			}
		}
	}
}
