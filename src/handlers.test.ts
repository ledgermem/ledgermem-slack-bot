import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleRemember,
  handleRecall,
  handleForget,
  handleSaveShortcut,
  type MemoryClient,
} from "./handlers.js";

function makeMemory(overrides: Partial<MemoryClient> = {}): MemoryClient {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as MemoryClient;
}

describe("handleRemember", () => {
  let memory: MemoryClient;

  beforeEach(() => {
    memory = makeMemory();
  });

  it("rejects empty text", async () => {
    const result = await handleRemember({
      text: "  ",
      userId: "U1",
      channelId: "C1",
      optedInChannels: new Set(),
      memory,
    });
    expect(result.text).toContain("Usage");
    expect(memory.add).not.toHaveBeenCalled();
  });

  it("blocks channels not opted in when allowlist is non-empty", async () => {
    const result = await handleRemember({
      text: "hello",
      userId: "U1",
      channelId: "C1",
      optedInChannels: new Set(["C2"]),
      memory,
    });
    expect(result.text).toContain("not opted in");
    expect(memory.add).not.toHaveBeenCalled();
  });

  it("saves with slack metadata", async () => {
    await handleRemember({
      text: "remember this",
      userId: "U42",
      channelId: "C99",
      optedInChannels: new Set(),
      memory,
    });
    expect(memory.add).toHaveBeenCalledWith("remember this", {
      metadata: { source: "slack", threadId: "C99", userId: "U42" },
    });
  });
});

describe("handleRecall", () => {
  it("returns ephemeral no-match message when search is empty", async () => {
    const memory = makeMemory({ search: vi.fn().mockResolvedValue([]) });
    const result = await handleRecall({
      text: "anything",
      userId: "U1",
      optedInChannels: new Set(),
      memory,
    });
    expect(result.responseType).toBe("ephemeral");
    expect(result.text).toContain("No matches");
  });

  it("formats top 3 hits", async () => {
    const memory = makeMemory({
      search: vi.fn().mockResolvedValue([
        { id: "a", content: "first", score: 0.9 },
        { id: "b", content: "second", score: 0.7 },
        { id: "c", content: "third", score: 0.5 },
      ]),
    });
    const result = await handleRecall({
      text: "q",
      userId: "U1",
      optedInChannels: new Set(),
      memory,
    });
    expect(memory.search).toHaveBeenCalledWith("q", { limit: 3 });
    expect(result.text).toContain("first");
    expect(result.text).toContain("id: a");
  });
});

describe("handleForget", () => {
  it("rejects empty id", async () => {
    const memory = makeMemory();
    const result = await handleForget({
      text: "",
      userId: "U1",
      optedInChannels: new Set(),
      memory,
    });
    expect(result.text).toContain("Usage");
    expect(memory.delete).not.toHaveBeenCalled();
  });

  it("calls delete with id", async () => {
    const memory = makeMemory();
    await handleForget({
      text: "mem_123",
      userId: "U1",
      optedInChannels: new Set(),
      memory,
    });
    expect(memory.delete).toHaveBeenCalledWith("mem_123");
  });
});

describe("handleSaveShortcut", () => {
  it("saves message text with shortcut source", async () => {
    const memory = makeMemory();
    const reply = await handleSaveShortcut({
      messageText: "captured msg",
      userId: "U1",
      channelId: "C1",
      threadTs: "1234.5",
      optedInChannels: new Set(),
      memory,
    });
    expect(reply).toContain("Saved");
    expect(memory.add).toHaveBeenCalledWith("captured msg", {
      metadata: { source: "slack-shortcut", threadId: "1234.5", userId: "U1" },
    });
  });
});
