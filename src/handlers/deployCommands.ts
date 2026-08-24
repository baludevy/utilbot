import { REST, Routes } from "discord.js";
import type { Command } from "../types/command.js";

export async function deployCommands(
	token: string,
	clientId: string,
	commands: Iterable<Command>,
): Promise<void> {
	const rest = new REST({ version: "10" }).setToken(token);

	const body = [...commands].map((command) => command.data);

	await rest.put(Routes.applicationCommands(clientId), { body });
}
