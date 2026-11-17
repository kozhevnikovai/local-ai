import { describe, expect, it, vi } from "vitest";

const log: string[] = [];
let release: (() => void) | null = null;
vi.mock("node-llama-cpp", () => {
  class QwenChatWrapper {}
  class LlamaChatSession {
    prompt(user: string) {
      log.push("start " + user);
      return new Promise<string>(r => { release = () => { log.push("end " + user); r("ok " + user); }; });
    }
    dispose() {}
  }
  const llama = {
    gpu: false,
    loadModel: async () => ({
      createContext: async () => ({ getSequence: () => ({ clearHistory: async () => undefined }), dispose: async () => { log.push("context.dispose"); } }),
      dispose: async () => { log.push("model.dispose"); },
    }),
    dispose: async () => { log.push("llama.dispose"); },
  };
  return { getLlama: async () => llama, LlamaChatSession, QwenChatWrapper, resolveChatWrapper: () => ({}) };
});

const { loadLocalLLM } = await import("../src/llm.js");
const tick = () => new Promise(r => setTimeout(r, 10));

describe("очередь и выгрузка модели", () => {
  it("отмена ожидающего запроса срабатывает сразу", async () => {
    log.length = 0;
    const llm = await loadLocalLLM({ modelFile: "m.gguf" });
    const first = llm.text("s", "1");
    await tick();
    const ac = new AbortController();
    const second = llm.text("s", "2", 100, { signal: ac.signal });
    ac.abort();
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    release!();
    await expect(first).resolves.toBe("ok 1");
    expect(log).not.toContain("start 2");
  });
  it("dispose ждёт текущий ответ, отклоняет новые, повторный вызов безопасен", async () => {
    log.length = 0;
    const llm = await loadLocalLLM({ modelFile: "m.gguf" });
    const first = llm.text("s", "1");
    await tick();
    const d1 = llm.dispose(); const d2 = llm.dispose();
    await expect(llm.text("s", "3")).rejects.toThrow(/выгружена/);
    await tick();
    expect(log).not.toContain("context.dispose");
    release!();
    await first; await d1; await d2;
    expect(log.indexOf("end 1")).toBeLessThan(log.indexOf("context.dispose"));
    expect(log.filter(x => x === "llama.dispose")).toHaveLength(1);
  });
});
