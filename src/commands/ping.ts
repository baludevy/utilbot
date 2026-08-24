import type { Command } from "../types/command.js";

export const ping: Command = {
	data: {
		name: "ping",
		description: "Get latency",
		integration_types: [1],
		contexts: [0, 1, 2],
	},
	async execute(interaction) {
		const started = Date.now();

		await interaction.reply(`\`\`\`Pinging...\`\`\``);

		const ping = Date.now() - started;

		await interaction.editReply(`\`\`\`Pong! ${ping} ms\`\`\``);
	}
};

export default ping;
