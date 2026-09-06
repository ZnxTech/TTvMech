import { plugin } from "@ttvmech/plugin-api";

export default plugin({
	name: "example_hey",
	version: "1.0.0",

	onMessage: async (state, bot, ev) => {
		if (ev.text.includes(`hey ${bot.origin_dname}`)) {
			await bot.message(ev.channel_id, `hey ${ev.chatter_dname}`, ev.message_id);
		}
	},
});
