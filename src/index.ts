import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig } from "./config.js";
import { deployCommands } from "./handlers/deployCommands.js";
import { loadCommands } from "./handlers/loadCommands.js";

const config = loadConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = await loadCommands();
await deployCommands(config.token, config.clientId, commands.values());

client.on("interactionCreate", async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const cmd = commands.get(interaction.commandName);

	if (!cmd) return;

	try {
		await cmd.execute(interaction);
	} catch (error) {
		console.error(`Command /${interaction.commandName} failed:`, error);

		interaction.editReply(`\`\`\`${error}\`\`\``);
	}
});

client.once("clientReady", () => {
	console.log(`Logged in as ${client.user?.tag ?? "unknown user"}`);
});
await client.login(config.token);
