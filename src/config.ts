import { readFileSync, existsSync } from "node:fs";

export interface BotConfig {
  slackBotToken: string;
  slackAppToken: string;
  slackSigningSecret: string;
  ledgermemApiKey: string;
  ledgermemWorkspaceId: string;
  socketMode: boolean;
  port: number;
  optInChannels: Set<string>;
}

const REQUIRED = [
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "LEDGERMEM_API_KEY",
  "LEDGERMEM_WORKSPACE_ID",
] as const;

function loadOptInChannels(): Set<string> {
  const fromEnv = process.env.OPT_IN_CHANNELS;
  if (fromEnv) {
    return new Set(
      fromEnv
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    );
  }
  const path = process.env.OPT_IN_FILE ?? "./channels.json";
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (Array.isArray(raw)) {
      return new Set(raw.filter((v): v is string => typeof v === "string"));
    }
  }
  return new Set();
}

export function loadConfig(): BotConfig {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  const socketMode = process.env.SOCKET_MODE !== "false";
  if (socketMode && !process.env.SLACK_APP_TOKEN) {
    throw new Error("SLACK_APP_TOKEN is required when SOCKET_MODE is enabled");
  }
  return {
    slackBotToken: process.env.SLACK_BOT_TOKEN as string,
    slackAppToken: process.env.SLACK_APP_TOKEN ?? "",
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET as string,
    ledgermemApiKey: process.env.LEDGERMEM_API_KEY as string,
    ledgermemWorkspaceId: process.env.LEDGERMEM_WORKSPACE_ID as string,
    socketMode,
    port: Number(process.env.PORT ?? 3000),
    optInChannels: loadOptInChannels(),
  };
}

export function isChannelOptedIn(
  channelId: string | undefined,
  optedIn: Set<string>,
): boolean {
  if (!channelId) return false;
  if (optedIn.size === 0) return true;
  return optedIn.has(channelId);
}
