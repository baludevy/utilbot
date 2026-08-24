export type Config = Readonly<{
	token: string;
	clientId: string;
}>;

function requireEnvironmentVariable(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export function loadConfig(): Config {
	return {
		token: requireEnvironmentVariable("DISCORD_TOKEN"),
		clientId: requireEnvironmentVariable("DISCORD_CLIENT_ID"),
	};
}
