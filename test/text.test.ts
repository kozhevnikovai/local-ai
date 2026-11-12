import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkText, getModel, mapReduce, removeModel } from "../src/index.js";

describe("длинные тексты", () => {
  const para = (n: number) => Array.from({ length: n }, (_, i) => `Реплика ${i}. Обсудили пункт номер ${i} и решили двигаться дальше.`).join("\n");

  it("короткий текст — одна часть, пустой — ни одной", () => {
    expect(chunkText("Привет.")).toEqual(["Привет."]);
    expect(chunkText("  \n ")).toEqual([]);
  });

  it("части не длиннее лимита, режутся по строкам, текст не теряется", () => {
    const t = para(400);
    const parts = chunkText(t, { maxChars: 2000 });
    expect(parts.length).toBeGreaterThan(5);
    for (const p of parts) { expect(p.length).toBeLessThanOrEqual(2000); expect(p.startsWith("Реплика")).toBe(true); }
    expect(parts.join("\n")).toBe(t);
  });

  it("перекрытие повторяет конец предыдущей части", () => {
    const parts = chunkText(para(200), { maxChars: 1500, overlap: 200 });
    for (let i = 1; i < parts.length; i++) {
      const tail = parts[i - 1].slice(-60).trim().split(" ").slice(-3).join(" ");
      expect(parts[i]).toContain(tail);
    }
  });

  it("слово без пробелов длиннее лимита режется жёстко", () => {
    const parts = chunkText("я".repeat(1000), { maxChars: 300 });
    expect(parts.every(p => p.length <= 300)).toBe(true);
    expect(parts.join("")).toHaveLength(1000);
  });

  it("по частям → итог, с прогрессом и остановкой", async () => {
    const seen: number[] = [];
    const r = await mapReduce({ chunks: ["а", "б", "в"], map: async c => c.toUpperCase(), reduce: async p => p.join(""), onProgress: d => seen.push(d) });
    expect(r).toBe("АБВ");
    expect(seen).toEqual([1, 2, 3]);
    const ac = new AbortController();
    await expect(mapReduce({ chunks: ["а", "б"], map: async c => { ac.abort(); return c; }, reduce: async p => p, signal: ac.signal })).rejects.toThrow("Остановлено");
  });

  it("удаление модели, включая недокачанную", () => {
    const dir = mkdtempSync(join(tmpdir(), "lai-rm-"));
    const m = getModel("qwen3-4b");
    mkdirSync(join(dir, "llm"), { recursive: true });
    writeFileSync(join(dir, m.file.path) + ".part", "x");
    expect(removeModel(dir, m)).toBe(true);
    expect(existsSync(join(dir, m.file.path) + ".part")).toBe(false);
    expect(removeModel(dir, m)).toBe(false);
  });
});
