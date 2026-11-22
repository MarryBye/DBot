import 'dotenv/config';

export interface Config {
  discordToken: string;
  clientId: string;
  clientSecret: string;
  guildId: string;
  workerTokens: string[];
  prefix: string;
  port: number;
  host: string;
  publicUrl: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
}

function loadWorkerTokens(): string[] {
  const tokens: string[] = [];

  for (let i = 1; i <= 10; i++) {
    const token = process.env[`WORKER_TOKEN_${i}`];
    if (token && token.trim().length > 0) {
      tokens.push(token.trim());
    }
  }

  if (process.env.WORKER_TOKENS) {
    const list = process.env.WORKER_TOKENS.split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    for (const t of list) {
      if (!tokens.includes(t)) {
        tokens.push(t);
      }
    }
  }

  return tokens;
}

const port = parseInt(process.env.PORT || '3000', 10);

export const config: Config = {
  discordToken: process.env.DISCORD_TOKEN ?? '',
  clientId: process.env.CLIENT_ID ?? '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
  guildId: process.env.GUILD_ID ?? '',
  workerTokens: loadWorkerTokens(),
  prefix: process.env.PREFIX || '+',
  port,
  host: process.env.HOST || '0.0.0.0',
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID ?? '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? '',
};
