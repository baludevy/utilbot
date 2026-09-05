import { tmpdir } from "os";
import { join } from "path";

export async function downloadVideo(inputUrl: string): Promise<string> {
    const url = validateUrl(inputUrl);

    const outputPath = join(
        tmpdir(),
        `video-${crypto.randomUUID()}.%(ext)s`
    );

    const proc = Bun.spawn(
        [
            "yt-dlp",
            "--no-playlist",
            "--no-part",
            "--no-mtime",
            "--concurrent-fragments",
            "8",
            "--fragment-retries",
            "3",
            "--retries",
            "3",
            "-f",
            "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]",
            "--merge-output-format",
            "mp4",
            "-o",
            outputPath,
            "--print",
            "after_move:filepath",
            "--",
            url.toString(),
        ],
        {
            stdout: "pipe",
            stderr: "pipe",
        }
    );

    const [exitCode, stdoutText, stderrText] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);

    if (exitCode !== 0) {
        throw new Error(
            `yt-dlp failed with exit code ${exitCode}.\n${stderrText.trim()}`
        );
    }

    const finalPath = stdoutText
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .at(-1);

    if (!finalPath) {
        throw new Error("yt-dlp did not return a downloaded file path");
    }

    return finalPath;
}

function validateUrl(input: string): URL {
    let url: URL;

    try {
        url = new URL(input);
    } catch {
        throw new Error("Invalid URL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Invalid URL");
    }

    return url;
}