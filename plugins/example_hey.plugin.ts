import { plugin } from "@ttvmech/plugin-api";

export default plugin({
	name: "example_hey",
	version: "1.0.0",

	on_message: async (state, bot, ev) => {
		const bot_name = bot.getDName();

		if (ev.text.includes(`hey ${bot_name}`)) {
			await bot.message(ev.channel_id, `hey ${ev.chatter_dname}`, ev.message_id);
		}
	},
});
