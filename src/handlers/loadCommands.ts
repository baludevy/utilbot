import { Collection } from "discord.js";
import { readdir } from "node:fs/promises";
import { extname } from "node:path";
import type { Command } from "../types/command.js";

const COMMAND_EXTENSIONS = new Set([".js", ".ts"]);

function isCommand(value: unknown): value is Command {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<Command>;
	return (
		typeof candidate.execute === "function" &&
		typeof candidate.data?.name === "string" &&
		"description" in candidate.data &&
		typeof candidate.data.description === "string"
	);
}

export async function loadCommands(): Promise<Collection<string, Command>> {
	const commands = new Collection<string, Command>();
	const commandsDirectory = new URL("../commands/", import.meta.url);
	const files = (await readdir(commandsDirectory))
		.filter((file) => COMMAND_EXTENSIONS.has(extname(file)))
		.sort();

	for (const file of files) {
		const fileUrl = new URL(file, commandsDirectory).href;
		const module: unknown = await import(fileUrl);
		const command = (module as { default?: unknown }).default;

		if (!isCommand(command)) {
			throw new TypeError(`Command module ${file} does not have a valid default export`);
		}
		if (commands.has(command.data.name)) {
			throw new Error(`Duplicate command name: ${command.data.name}`);
		}

		commands.set(command.data.name, command);
	}

	return commands;
}
