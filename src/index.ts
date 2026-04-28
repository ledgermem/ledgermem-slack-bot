import "dotenv/config";
import bolt from "@slack/bolt";
import { LedgerMem } from "@ledgermem/memory";
import { loadConfig } from "./config.js";
import {
  handleRemember,
  handleRecall,
  handleForget,
  handleSaveShortcut,
} from "./handlers.js";

const { App } = bolt;

// Slack's chat.* APIs reject messages whose `text` exceeds 3000 chars
// (slack/web-api: invalid_arguments / msg_too_long). Recall payloads with a
// few large memories blow past that, so clamp before responding.
const SLACK_TEXT_LIMIT = 3000;
const TRUNCATION_SUFFIX = "\n…(truncated)";

function clampForSlack(text: string): string {
  if (text.length <= SLACK_TEXT_LIMIT) return text;
  const room = SLACK_TEXT_LIMIT - TRUNCATION_SUFFIX.length;
  return `${text.slice(0, room)}${TRUNCATION_SUFFIX}`;
}

// Slack retries any non-2xx delivery up to 3 times. We dedup by command/event
// id so a write-side handler can't double-ingest on a retry.
const RETRY_NUM_HEADER = "x-slack-retry-num";

function isSlackRetry(headers: Record<string, string | string[] | undefined> | undefined): boolean {
  if (!headers) return false;
  const v = headers[RETRY_NUM_HEADER];
  return typeof v === "string" ? v !== "" : Array.isArray(v) && v.length > 0;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const memory = new LedgerMem({
    apiKey: cfg.ledgermemApiKey,
    workspaceId: cfg.ledgermemWorkspaceId,
  });

  const app = new App({
    token: cfg.slackBotToken,
    signingSecret: cfg.slackSigningSecret,
    socketMode: cfg.socketMode,
    appToken: cfg.socketMode ? cfg.slackAppToken : undefined,
    port: cfg.port,
  });

  // Bounded set of recently handled command/shortcut ids — drops the oldest
  // entry once the cap is hit so memory stays flat.
  const handledIds = new Set<string>();
  const HANDLED_MAX = 5000;
  const remember = (id: string): boolean => {
    if (handledIds.has(id)) return false;
    handledIds.add(id);
    if (handledIds.size > HANDLED_MAX) {
      const first = handledIds.values().next().value;
      if (first) handledIds.delete(first);
    }
    return true;
  };

  app.command("/remember", async ({ ack, command, respond, body }) => {
    await ack();
    // Slash command bodies have a trigger_id that is unique per invocation —
    // skip duplicate deliveries from Slack retries.
    const dedupKey = `cmd:${(body as { trigger_id?: string }).trigger_id ?? ""}`;
    if (!remember(dedupKey)) return;
    try {
      const result = await handleRemember({
        text: command.text,
        channelId: command.channel_id,
        userId: command.user_id,
        optedInChannels: cfg.optInChannels,
        memory,
      });
      await respond({ response_type: result.responseType, text: clampForSlack(result.text) });
    } catch (err) {
      console.error("/remember failed:", err);
      await respond({ response_type: "ephemeral", text: "Sorry, something went wrong." });
    }
  });

  app.command("/recall", async ({ ack, command, respond, body }) => {
    await ack();
    const dedupKey = `cmd:${(body as { trigger_id?: string }).trigger_id ?? ""}`;
    if (!remember(dedupKey)) return;
    try {
      const result = await handleRecall({
        text: command.text,
        channelId: command.channel_id,
        userId: command.user_id,
        optedInChannels: cfg.optInChannels,
        memory,
      });
      await respond({ response_type: result.responseType, text: clampForSlack(result.text) });
    } catch (err) {
      console.error("/recall failed:", err);
      await respond({ response_type: "ephemeral", text: "Sorry, something went wrong." });
    }
  });

  app.command("/forget", async ({ ack, command, respond, body }) => {
    await ack();
    const dedupKey = `cmd:${(body as { trigger_id?: string }).trigger_id ?? ""}`;
    if (!remember(dedupKey)) return;
    try {
      const result = await handleForget({
        text: command.text,
        channelId: command.channel_id,
        userId: command.user_id,
        optedInChannels: cfg.optInChannels,
        memory,
      });
      await respond({ response_type: result.responseType, text: clampForSlack(result.text) });
    } catch (err) {
      console.error("/forget failed:", err);
      await respond({ response_type: "ephemeral", text: "Sorry, something went wrong." });
    }
  });

  app.shortcut("save_to_memory", async ({ ack, shortcut, client }) => {
    await ack();
    if (shortcut.type !== "message_action") return;
    const dedupKey = `sc:${shortcut.trigger_id}`;
    if (!remember(dedupKey)) return;
    const text = shortcut.message.text ?? "";
    try {
      const reply = await handleSaveShortcut({
        messageText: text,
        channelId: shortcut.channel.id,
        userId: shortcut.user.id,
        threadTs: shortcut.message.thread_ts ?? shortcut.message.ts,
        optedInChannels: cfg.optInChannels,
        memory,
      });
      await client.chat.postEphemeral({
        channel: shortcut.channel.id,
        user: shortcut.user.id,
        text: clampForSlack(reply),
      });
    } catch (err) {
      console.error("save_to_memory failed:", err);
      try {
        await client.chat.postEphemeral({
          channel: shortcut.channel.id,
          user: shortcut.user.id,
          text: "Sorry, something went wrong saving that message.",
        });
      } catch {
        // user may have closed channel — silent ok
      }
    }
  });

  // Mark unused for now (kept for future webhook-delivery path).
  void isSlackRetry;

  await app.start();
  // eslint-disable-next-line no-console
  console.log(
    `LedgerMem Slack bot running (${cfg.socketMode ? "socket" : "http"} mode, port ${cfg.port}).`,
  );

  // Graceful shutdown — app.stop() drains the socket-mode receiver and the
  // HTTP server so SIGTERM doesn't drop in-flight handlers mid-request.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, stopping Slack app…`);
    try {
      await app.stop();
    } catch (err) {
      console.error("app.stop failed:", err);
    }
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
