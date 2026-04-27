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

  app.command("/remember", async ({ ack, command, respond }) => {
    await ack();
    const result = await handleRemember({
      text: command.text,
      channelId: command.channel_id,
      userId: command.user_id,
      optedInChannels: cfg.optInChannels,
      memory,
    });
    await respond({ response_type: result.responseType, text: result.text });
  });

  app.command("/recall", async ({ ack, command, respond }) => {
    await ack();
    const result = await handleRecall({
      text: command.text,
      channelId: command.channel_id,
      userId: command.user_id,
      optedInChannels: cfg.optInChannels,
      memory,
    });
    await respond({ response_type: result.responseType, text: result.text });
  });

  app.command("/forget", async ({ ack, command, respond }) => {
    await ack();
    const result = await handleForget({
      text: command.text,
      channelId: command.channel_id,
      userId: command.user_id,
      optedInChannels: cfg.optInChannels,
      memory,
    });
    await respond({ response_type: result.responseType, text: result.text });
  });

  app.shortcut("save_to_memory", async ({ ack, shortcut, client }) => {
    await ack();
    if (shortcut.type !== "message_action") return;
    const text = shortcut.message.text ?? "";
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
      text: reply,
    });
  });

  await app.start();
  // eslint-disable-next-line no-console
  console.log(
    `LedgerMem Slack bot running (${cfg.socketMode ? "socket" : "http"} mode, port ${cfg.port}).`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", err);
  process.exit(1);
});
