import type { Command } from "../types/command.js";
import {
    compressVideo,
    type VideoQuality,
} from "../utils/compressor.js";
import { downloadVideo } from "../utils/downloader.js";

export const save: Command = {
    data: {
        name: "save",
        description: "Download and compress media directly",
        integration_types: [1],
        contexts: [0, 1, 2],
        options: [
            {
                type: 3,
                name: "url",
                description: "URL of the media to download",
                required: true,
            },
            {
                type: 3,
                name: "quality",
                description: "Compression quality",
                required: false,
                choices: [
                    {
                        name: "Good",
                        value: "good",
                    },
                    {
                        name: "OK",
                        value: "ok",
                    },
                    {
                        name: "Bad",
                        value: "bad",
                    },
                ],
            },
            {
                type: 5,
                name: "verbose",
                description: "Show download and compression diagnostics",
                required: false,
            },
        ],
    },

    async execute(interaction) {
        await interaction.deferReply();

        const url =
            interaction.options.getString("url") ?? "";

        const quality =
            (interaction.options.getString(
                "quality"
            ) as VideoQuality | null) ??
            "good";

        const verbose =
            interaction.options.getBoolean(
                "verbose"
            ) ?? false;

        const totalStartedAt = performance.now();

        const downloadStartedAt = performance.now();

        const downloadedPath =
            await downloadVideo(url);

        const downloadTimeMs =
            performance.now() -
            downloadStartedAt;

        const compressionStartedAt =
            performance.now();

        const compressed =
            await compressVideo(
                downloadedPath,
                quality
            );

        const compressionTimeMs =
            performance.now() -
            compressionStartedAt;

        const uploadStartedAt =
            performance.now();

        if (!verbose) {
            await interaction.editReply({
                files: [
                    compressed.path,
                ],
            });

            return;
        }

        await interaction.editReply({
            content: [
                "```txt",
                `Quality:          ${quality}`,
                `Encoder:          ${compressed.encoder}`,
                `Download time:    ${formatDuration(downloadTimeMs)}`,
                `Compression time: ${formatDuration(compressionTimeMs)}`,
                `Upload time:      uploading...`,
                `Target size:      ${compressed.targetSizeMB.toFixed(2)} MB`,
                `Output size:      ${compressed.outputSizeMB.toFixed(2)} MB`,
                `Resolution:       ${compressed.width}x${compressed.height}`,
                `Video bitrate:    ${compressed.videoKbps} kbps`,
                `Audio bitrate:    ${compressed.audioKbps} kbps`,
                `Total bitrate:    ${compressed.totalKbps} kbps`,
                "```",
            ].join("\n"),
            files: [
                compressed.path,
            ],
        });

        const uploadTimeMs =
            performance.now() -
            uploadStartedAt;

        const totalTimeMs =
            performance.now() -
            totalStartedAt;

        await interaction.editReply({
            content: [
                "```txt",
                `Quality:          ${quality}`,
                `Encoder:          ${compressed.encoder}`,
                `Download time:    ${formatDuration(downloadTimeMs)}`,
                `Compression time: ${formatDuration(compressionTimeMs)}`,
                `Upload time:      ${formatDuration(uploadTimeMs)}`,
                `Total time:       ${formatDuration(totalTimeMs)}`,
                `Target size:      ${compressed.targetSizeMB.toFixed(2)} MB`,
                `Output size:      ${compressed.outputSizeMB.toFixed(2)} MB`,
                `Resolution:       ${compressed.width}x${compressed.height}`,
                `Video bitrate:    ${compressed.videoKbps} kbps`,
                `Audio bitrate:    ${compressed.audioKbps} kbps`,
                `Total bitrate:    ${compressed.totalKbps} kbps`,
                "```",
            ].join("\n"),
        });
    }
};

function formatDuration(
    milliseconds: number
): string {
    if (milliseconds < 1000) {
        return `${Math.round(milliseconds)} ms`;
    }

    const seconds =
        milliseconds / 1000;

    if (seconds < 60) {
        return `${seconds.toFixed(2)} s`;
    }

    const minutes =
        Math.floor(seconds / 60);

    const remainingSeconds =
        seconds % 60;

    return `${minutes}m ${remainingSeconds.toFixed(2)}s`;
}

export default save;