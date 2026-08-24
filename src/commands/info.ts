import os from "node:os";

import type { Command } from "../types/command.js";

function formatDuration(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function formatBytes(bytes: number) {
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export const info: Command = {
    data: {
        name: "info",
        description: "Get some info about the bot",
        integration_types: [1],
        contexts: [0, 1, 2],
    },

    async execute(interaction) {
        const client = interaction.client;

        const totalRam = os.totalmem();
        const freeRam = os.freemem();
        const usedRam = totalRam - freeRam;

        const info = [
            `• Bot: ${client.user?.tag}\n`,
            `• Uptime: ${formatDuration(client.uptime ?? 0)}\n`,
            `• OS: ${os.type()} ${os.arch()}`,
            `• CPU: ${os.cpus()[0]?.model.trim() ?? "Unknown"}\n`,
            `• RAM Usage: ${formatBytes(usedRam)} / ${formatBytes(totalRam)}`,
            `• Free RAM: ${formatBytes(freeRam)}`,
        ].join("\n");

        await interaction.reply(`\`\`\`\n${info}\n\`\`\``);
    },
};

export default info;