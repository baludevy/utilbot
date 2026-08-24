import { tmpdir } from "os";
import { join } from "path";

export async function downloadVideo(inputUrl: string): Promise<string> {
    const url: URL = validateUrl(inputUrl);

    const outputPath: string = join(tmpdir(), `video-${crypto.randomUUID()}.%(ext)s`);

    const proc = Bun.spawn([
        "yt-dlp",
        "-f",
        "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]",
        "--no-playlist",
        "-o",
        outputPath,
        "--print",
        "after_move:filepath",
        "--",
        url.toString(),
    ], {
        stdout: "pipe",
        stderr: "pipe",
    });

    const exitCode: number = await proc.exited;

    const stdoutText = await new Response(proc.stdout).text();
    const stderrText = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
    throw new Error(
        `yt-dlp failed with exit code ${exitCode}.\n${stderrText.trim()}`
    );
}
    const finalPath = stdoutText.trim();

    return finalPath;
}

function validateUrl(input: string): URL {
    const url: URL = new URL(input);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Invalid URL");
    }

    return url;
}