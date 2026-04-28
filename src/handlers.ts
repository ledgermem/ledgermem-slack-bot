import type { LedgerMem } from "@ledgermem/memory";
import { isChannelOptedIn } from "./config.js";

export interface MemoryClient {
  search: LedgerMem["search"];
  add: LedgerMem["add"];
  delete?: (id: string) => Promise<void>;
}

export interface SearchHit {
  id: string;
  content: string;
  score?: number;
}

export interface CommandContext {
  text: string;
  channelId?: string;
  userId: string;
  optedInChannels: Set<string>;
  memory: MemoryClient;
}

export interface CommandResult {
  responseType: "ephemeral" | "in_channel";
  text: string;
}

const TOP_K = 3;

export async function handleRemember(ctx: CommandContext): Promise<CommandResult> {
  const content = ctx.text.trim();
  if (!content) {
    return { responseType: "ephemeral", text: "Usage: `/remember <text>`" };
  }
  if (!isChannelOptedIn(ctx.channelId, ctx.optedInChannels)) {
    return {
      responseType: "ephemeral",
      text: "This channel is not opted in to LedgerMem. Ask an admin to add it.",
    };
  }
  await ctx.memory.add(content, {
    metadata: {
      source: "slack",
      threadId: ctx.channelId ?? "dm",
      userId: ctx.userId,
    },
  });
  return { responseType: "ephemeral", text: `Saved to memory.` };
}

export async function handleRecall(ctx: CommandContext): Promise<CommandResult> {
  const query = ctx.text.trim();
  if (!query) {
    return { responseType: "ephemeral", text: "Usage: `/recall <query>`" };
  }
  // Recall is read-only but still hits workspace memory — the opt-in list is
  // also our authorization boundary, so reject from non-opted channels just
  // like remember/forget rather than leaking content into a private channel
  // the workspace admin hasn't approved.
  if (!isChannelOptedIn(ctx.channelId, ctx.optedInChannels)) {
    return {
      responseType: "ephemeral",
      text: "This channel is not opted in to LedgerMem. Ask an admin to add it.",
    };
  }
  const hits = (await ctx.memory.search(query, { limit: TOP_K })) as SearchHit[];
  if (!hits || hits.length === 0) {
    return {
      responseType: "ephemeral",
      text: `No matches found for *${query}*.`,
    };
  }
  const lines = hits.map(
    (hit, i) =>
      `*${i + 1}.* ${hit.content}${hit.score !== undefined ? ` _(score: ${hit.score.toFixed(2)})_` : ""}\n  \`id: ${hit.id}\``,
  );
  return {
    responseType: "ephemeral",
    text: `Top ${hits.length} matches for *${query}*:\n${lines.join("\n")}`,
  };
}

export async function handleForget(ctx: CommandContext): Promise<CommandResult> {
  const id = ctx.text.trim();
  if (!id) {
    return { responseType: "ephemeral", text: "Usage: `/forget <id>`" };
  }
  if (typeof ctx.memory.delete !== "function") {
    return {
      responseType: "ephemeral",
      text: "Delete is not supported by this LedgerMem client version.",
    };
  }
  await ctx.memory.delete(id);
  return { responseType: "ephemeral", text: `Forgot memory \`${id}\`.` };
}

export interface ShortcutContext {
  messageText: string;
  channelId?: string;
  userId: string;
  threadTs?: string;
  optedInChannels: Set<string>;
  memory: MemoryClient;
}

export async function handleSaveShortcut(ctx: ShortcutContext): Promise<string> {
  if (!ctx.messageText.trim()) {
    return "Cannot save empty message.";
  }
  if (!isChannelOptedIn(ctx.channelId, ctx.optedInChannels)) {
    return "This channel is not opted in to LedgerMem.";
  }
  await ctx.memory.add(ctx.messageText, {
    metadata: {
      source: "slack-shortcut",
      threadId: ctx.threadTs ?? ctx.channelId ?? "dm",
      userId: ctx.userId,
    },
  });
  return "Saved to memory.";
}
