import { tmpdir } from "os";
import { join } from "path";
import { rm, stat } from "fs/promises";

export type VideoQuality = "good" | "ok" | "bad";

type VideoInfo = {
    duration: number;
    width: number;
    height: number;
};

type BitrateInfo = {
    totalKbps: number;
    videoKbps: number;
    audioKbps: number;
};

type Resolution = {
    width: number;
    height: number;
};

type HardwareEncoder =
    | "h264_nvenc"
    | "h264_qsv"
    | "h264_amf"
    | "h264_videotoolbox"
    | "h264_vaapi";

export type CompressionResult = {
    path: string;
    encoder: HardwareEncoder | "libx264";
    targetSizeMB: number;
    outputSizeMB: number;
    totalKbps: number;
    videoKbps: number;
    audioKbps: number;
    width: number;
    height: number;
};

const TARGET_SIZE_MB_BY_QUALITY: Record<VideoQuality, number> = {
    good: 18,
    ok: 8,
    bad: 4,
};

let cachedHardwareEncoder: HardwareEncoder | null | undefined;

export async function compressVideo(
    path: string,
    quality: VideoQuality = "good"
): Promise<CompressionResult> {
    const targetSizeMB = TARGET_SIZE_MB_BY_QUALITY[quality];

    const info = await getVideoInfo(path);

    const bitrate = calculateBitrate(
        info.duration,
        targetSizeMB
    );

    const resolution = calculateResolution(
        info.width,
        info.height,
        bitrate.videoKbps,
        quality
    );

    const outputPath = join(
        tmpdir(),
        `compressed-${crypto.randomUUID()}.mp4`
    );

    const hardwareEncoder = await detectHardwareEncoder();

    let usedEncoder: HardwareEncoder | "libx264";

    if (hardwareEncoder) {
        try {
            console.log(`[encoder] attempting ${hardwareEncoder}`);

            await encodeHardware(
                path,
                outputPath,
                info,
                resolution,
                bitrate,
                hardwareEncoder
            );

            usedEncoder = hardwareEncoder;

            console.log(`[encoder] used ${hardwareEncoder}`);
        } catch (error) {
            console.error(
                `[encoder] ${hardwareEncoder} failed during compression:`,
                error
            );

            await rm(outputPath, {
                force: true,
            });

            await encodeSoftware(
                path,
                outputPath,
                info,
                resolution,
                bitrate
            );

            usedEncoder = "libx264";

            console.log("[encoder] used libx264 fallback");
        }
    } else {
        console.log("[encoder] no hardware encoder available");

        await encodeSoftware(
            path,
            outputPath,
            info,
            resolution,
            bitrate
        );

        usedEncoder = "libx264";

        console.log("[encoder] used libx264");
    }

    const outputStats = await stat(outputPath);

    return {
        path: outputPath,
        encoder: usedEncoder,
        targetSizeMB,
        outputSizeMB:
            outputStats.size / 1024 / 1024,
        totalKbps: bitrate.totalKbps,
        videoKbps: bitrate.videoKbps,
        audioKbps: bitrate.audioKbps,
        width: resolution.width,
        height: resolution.height,
    };
}

async function encodeHardware(
    inputPath: string,
    outputPath: string,
    info: VideoInfo,
    resolution: Resolution,
    bitrate: BitrateInfo,
    encoder: HardwareEncoder
): Promise<void> {
    const needsScale =
        resolution.width !== info.width ||
        resolution.height !== info.height;

    if (encoder === "h264_vaapi") {
        const filters: string[] = [];

        if (needsScale) {
            filters.push(
                `scale=${resolution.width}:${resolution.height}`
            );
        }

        filters.push(
            "format=nv12",
            "hwupload"
        );

        await runFfmpeg([
            "-y",
            "-vaapi_device",
            "/dev/dri/renderD128",
            "-i",
            inputPath,
            "-vf",
            filters.join(","),
            "-c:v",
            encoder,
            "-b:v",
            `${bitrate.videoKbps}k`,
            "-maxrate",
            `${Math.floor(bitrate.videoKbps * 1.1)}k`,
            "-bufsize",
            `${bitrate.videoKbps * 2}k`,
            "-c:a",
            "aac",
            "-b:a",
            `${bitrate.audioKbps}k`,
            "-movflags",
            "+faststart",
            outputPath,
        ]);

        return;
    }

    const args: string[] = [
        "-y",
        "-i",
        inputPath,
    ];

    if (needsScale) {
        args.push(
            "-vf",
            `scale=${resolution.width}:${resolution.height}`
        );
    }

    args.push(
        "-c:v",
        encoder
    );

    switch (encoder) {
        case "h264_nvenc":
            args.push(
                "-preset",
                "p5",
                "-tune",
                "hq",
                "-rc",
                "vbr",
                "-multipass",
                "fullres",
                "-b:v",
                `${bitrate.videoKbps}k`,
                "-maxrate",
                `${Math.floor(bitrate.videoKbps * 1.1)}k`,
                "-bufsize",
                `${bitrate.videoKbps * 2}k`
            );
            break;

        case "h264_qsv":
            args.push(
                "-preset",
                "medium",
                "-b:v",
                `${bitrate.videoKbps}k`,
                "-maxrate",
                `${Math.floor(bitrate.videoKbps * 1.1)}k`,
                "-bufsize",
                `${bitrate.videoKbps * 2}k`
            );
            break;

        case "h264_amf":
            args.push(
                "-quality",
                "quality",
                "-rc",
                "vbr_peak",
                "-b:v",
                `${bitrate.videoKbps}k`,
                "-maxrate",
                `${Math.floor(bitrate.videoKbps * 1.1)}k`,
                "-bufsize",
                `${bitrate.videoKbps * 2}k`
            );
            break;

        case "h264_videotoolbox":
            args.push(
                "-b:v",
                `${bitrate.videoKbps}k`
            );
            break;
    }

    args.push(
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        `${bitrate.audioKbps}k`,
        "-movflags",
        "+faststart",
        outputPath
    );

    await runFfmpeg(args);
}

async function encodeSoftware(
    inputPath: string,
    outputPath: string,
    info: VideoInfo,
    resolution: Resolution,
    bitrate: BitrateInfo
): Promise<void> {
    const passLogPath = join(
        tmpdir(),
        `ffmpeg-pass-${crypto.randomUUID()}`
    );

    const scaleFilter =
        resolution.width !== info.width ||
            resolution.height !== info.height
            ? `scale=${resolution.width}:${resolution.height}`
            : null;

    try {
        await runFfmpeg([
            "-y",
            "-i",
            inputPath,
            ...(scaleFilter
                ? [
                    "-vf",
                    scaleFilter,
                ]
                : []),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-b:v",
            `${bitrate.videoKbps}k`,
            "-pass",
            "1",
            "-passlogfile",
            passLogPath,
            "-an",
            "-f",
            "null",
            process.platform === "win32"
                ? "NUL"
                : "/dev/null",
        ]);

        await runFfmpeg([
            "-y",
            "-i",
            inputPath,
            ...(scaleFilter
                ? [
                    "-vf",
                    scaleFilter,
                ]
                : []),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-b:v",
            `${bitrate.videoKbps}k`,
            "-pass",
            "2",
            "-passlogfile",
            passLogPath,
            "-c:a",
            "aac",
            "-b:a",
            `${bitrate.audioKbps}k`,
            "-movflags",
            "+faststart",
            outputPath,
        ]);
    } finally {
        await Promise.all([
            rm(
                `${passLogPath}-0.log`,
                {
                    force: true,
                }
            ),
            rm(
                `${passLogPath}-0.log.mbtree`,
                {
                    force: true,
                }
            ),
        ]);
    }
}

async function detectHardwareEncoder(): Promise<HardwareEncoder | null> {
    if (cachedHardwareEncoder !== undefined) {
        return cachedHardwareEncoder;
    }

    const candidates: HardwareEncoder[] = [];

    if (process.platform === "darwin") {
        candidates.push(
            "h264_videotoolbox"
        );
    }

    if (process.platform === "win32") {
        candidates.push(
            "h264_nvenc",
            "h264_qsv",
            "h264_amf"
        );
    }

    if (process.platform === "linux") {
        candidates.push(
            "h264_nvenc",
            "h264_qsv",
            "h264_vaapi"
        );
    }

    for (const encoder of candidates) {
        const available =
            await testHardwareEncoder(
                encoder
            );

        console.log(
            `[encoder] ${encoder}: ${available
                ? "available"
                : "unavailable"
            }`
        );

        if (available) {
            cachedHardwareEncoder =
                encoder;

            return encoder;
        }
    }

    cachedHardwareEncoder = null;

    return null;
}

async function testHardwareEncoder(
    encoder: HardwareEncoder
): Promise<boolean> {
    const args: string[] =
        encoder === "h264_vaapi"
            ? [
                "-hide_banner",
                "-v",
                "error",
                "-vaapi_device",
                "/dev/dri/renderD128",
                "-f",
                "lavfi",
                "-i",
                "color=black:size=640x360:duration=0.2",
                "-vf",
                "format=nv12,hwupload",
                "-frames:v",
                "3",
                "-c:v",
                encoder,
                "-f",
                "null",
                "-",
            ]
            : [
                "-hide_banner",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=black:size=640x360:duration=0.2",
                "-frames:v",
                "3",
                "-c:v",
                encoder,
                "-f",
                "null",
                "-",
            ];

    try {
        const proc = Bun.spawn(
            [
                "ffmpeg",
                ...args,
            ],
            {
                stdout: "ignore",
                stderr: "pipe",
            }
        );

        const [
            exitCode,
            stderrText,
        ] = await Promise.all([
            proc.exited,
            new Response(
                proc.stderr
            ).text(),
        ]);

        if (exitCode !== 0) {
            console.error(
                `[encoder] ${encoder} probe failed:\n${stderrText.trim()}`
            );

            return false;
        }

        return true;
    } catch (error) {
        console.error(
            `[encoder] ${encoder} probe error:`,
            error
        );

        return false;
    }
}

async function getVideoInfo(
    path: string
): Promise<VideoInfo> {
    const proc = Bun.spawn(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "format=duration:stream=width,height",
            "-of",
            "json",
            "--",
            path,
        ],
        {
            stdout: "pipe",
            stderr: "pipe",
        }
    );

    const [
        exitCode,
        stdoutText,
        stderrText,
    ] = await Promise.all([
        proc.exited,
        new Response(
            proc.stdout
        ).text(),
        new Response(
            proc.stderr
        ).text(),
    ]);

    if (exitCode !== 0) {
        throw new Error(
            `ffprobe failed with exit code ${exitCode}.\n${stderrText.trim()}`
        );
    }

    const data =
        JSON.parse(stdoutText);

    const duration =
        Number(
            data.format?.duration
        );

    const width =
        Number(
            data.streams?.[0]?.width
        );

    const height =
        Number(
            data.streams?.[0]?.height
        );

    if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        !Number.isFinite(width) ||
        width <= 0 ||
        !Number.isFinite(height) ||
        height <= 0
    ) {
        throw new Error(
            "Failed to read video metadata"
        );
    }

    return {
        duration,
        width,
        height,
    };
}

async function runFfmpeg(
    args: string[]
): Promise<void> {
    const proc = Bun.spawn(
        [
            "ffmpeg",
            ...args,
        ],
        {
            stdout: "ignore",
            stderr: "pipe",
        }
    );

    const [
        exitCode,
        stderrText,
    ] = await Promise.all([
        proc.exited,
        new Response(
            proc.stderr
        ).text(),
    ]);

    if (exitCode !== 0) {
        throw new Error(
            `ffmpeg failed with exit code ${exitCode}.\n${stderrText.trim()}`
        );
    }
}

function calculateBitrate(
    durationSec: number,
    targetSizeMB: number,
    audioKbps = 128
): BitrateInfo {
    const totalBps =
        (
            targetSizeMB *
            1024 *
            1024 *
            8 *
            0.96
        ) / durationSec;

    const totalKbps =
        totalBps / 1000;

    const videoKbps =
        Math.floor(
            totalKbps -
            audioKbps
        );

    if (videoKbps <= 0) {
        throw new Error(
            "Target file size is too small for this duration/audio bitrate"
        );
    }

    return {
        totalKbps:
            Math.floor(
                totalKbps
            ),
        videoKbps,
        audioKbps,
    };
}

function calculateResolution(
    width: number,
    height: number,
    videoKbps: number,
    quality: VideoQuality
): Resolution {
    let maxHeight: number;

    switch (quality) {
        case "good":
            maxHeight =
                calculateAutomaticMaxHeight(
                    videoKbps
                );
            break;

        case "ok":
            maxHeight = 720;
            break;

        case "bad":
            maxHeight = 480;
            break;
    }

    return limitResolution(
        width,
        height,
        maxHeight
    );
}

function calculateAutomaticMaxHeight(
    videoKbps: number
): number {
    if (videoKbps >= 2000) {
        return 1080;
    }

    if (videoKbps >= 900) {
        return 720;
    }

    if (videoKbps >= 400) {
        return 480;
    }

    return 360;
}

function limitResolution(
    width: number,
    height: number,
    maxHeight: number
): Resolution {
    if (height <= maxHeight) {
        return {
            width:
                makeEven(width),
            height:
                makeEven(height),
        };
    }

    const targetHeight =
        makeEven(maxHeight);

    const targetWidth =
        makeEven(
            (
                width /
                height
            ) *
            targetHeight
        );

    return {
        width: targetWidth,
        height: targetHeight,
    };
}

function makeEven(
    value: number
): number {
    return Math.max(
        2,
        Math.floor(
            value / 2
        ) * 2
    );
}