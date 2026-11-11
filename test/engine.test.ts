import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULTS, MODELS, downloadFiles, fits, getModel, missingFiles, recommend, type ModelFile } from "../src/index.js";

describe("каталог", () => {
  it("корректные записи", () => {
    expect(new Set(MODELS.map(m => m.id)).size).toBe(MODELS.length);
    for (const m of MODELS) {
      expect(m.file.url.startsWith("https://huggingface.co/")).toBe(true);
      expect(m.file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.file.size).toBeGreaterThan(1e9);
      expect(m.file.path).toMatch(/^llm\/[\w.\-]+\.gguf$/);
    }
    expect(getModel(DEFAULTS.light).tier).toBe("light");
    expect(getModel(DEFAULTS.strong).tier).toBe("strong");
    expect(() => getModel("нет")).toThrow();
  });
});

describe("выбор модели по железу", () => {
  const hw = (ramGb: number, gpu: string | null = null, vramGb = 0, unified = false) => ({ ramGb, cores: 8, gpu, vramGb, unified });
  it("ноутбук 8 ГБ без видеокарты → лёгкая", () => expect(recommend(hw(8)).tier).toBe("light"));
  it("ПК 16 ГБ без видеокарты → мощная", () => expect(recommend(hw(15.9)).tier).toBe("strong"));
  it("8 ГБ ОЗУ + видеокарта 12 ГБ → мощная", () => expect(recommend(hw(8, "cuda", 12)).tier).toBe("strong"));
  it("8 ГБ ОЗУ + видеокарта 8 ГБ → лёгкая (14B не помещается)", () => expect(recommend(hw(8, "cuda", 8)).tier).toBe("light"));
  it("в каталоге две модели, по одной на класс", () => expect(MODELS.map(m => m.id)).toEqual(["qwen3-4b", "qwen3-14b"]));
  it("Mac с общей памятью 8 ГБ → лёгкая (видеопамять = ОЗУ)", () => expect(recommend(hw(8, "metal", 5.3, true)).tier).toBe("light"));
  it("объясняет отказ", () => {
    const r = fits(getModel("qwen3-14b"), hw(8));
    expect(r.ok).toBe(false);
    expect(r.why).toContain("16 ГБ");
  });
});

describe("загрузка", () => {
  const data = Buffer.alloc(300_000, 7);
  const sha = createHash("sha256").update(data).digest("hex");
  let base = ""; let failOnce = true; let ranges: string[] = [];
  const server = createServer((req, res) => {
    const range = req.headers.range;
    ranges.push(range ?? "");
    if (req.url === "/cut" && failOnce) { failOnce = false; res.writeHead(200, { "content-length": data.length }); res.write(data.subarray(0, 100_000)); setTimeout(() => res.destroy(), 100); return; }
    if (range) { const from = Number(range.replace(/\D+/, "").split("-")[0]); res.writeHead(206, { "content-length": data.length - from }); res.end(data.subarray(from)); return; }
    res.writeHead(200, { "content-length": data.length }); res.end(data);
  });
  beforeAll(() => new Promise<void>(r => server.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${(server.address() as any).port}`; r(); })));
  afterAll(() => new Promise<void>(r => server.close(() => r())));
  // в тестах сервер локальный по http — подменяем адрес на https и обратно
  const net = (u: string, i: RequestInit) => fetch(u.replace("https://test", base), i);
  const file = (path: string, url: string, s = sha): ModelFile => ({ path, url: "https://test" + url, size: data.length, sha256: s });

  it("скачивает и проверяет SHA-256", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lai-"));
    await downloadFiles([file("llm/a.gguf", "/a")], { dir, fetch: net, mirrors: u => [u] });
    expect(readFileSync(join(dir, "llm/a.gguf")).equals(data)).toBe(true);
    expect(missingFiles(dir, [file("llm/a.gguf", "/a")])).toHaveLength(0);
  });
  it("после обрыва докачивает с места остановки", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lai-")); ranges = [];
    await expect(downloadFiles([file("llm/c.gguf", "/cut")], { dir, fetch: net, mirrors: u => [u] })).rejects.toThrow();
    await downloadFiles([file("llm/c.gguf", "/cut")], { dir, fetch: net, mirrors: u => [u] });
    expect(ranges.at(-1)).toBe("bytes=100000-");
    expect(readFileSync(join(dir, "llm/c.gguf")).equals(data)).toBe(true);
  });
  it("не принимает файл с другой суммой", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lai-"));
    await expect(downloadFiles([file("llm/b.gguf", "/b", "0".repeat(64))], { dir, fetch: net, mirrors: u => [u] })).rejects.toThrow(/контрольная сумма/);
    expect(existsSync(join(dir, "llm/b.gguf"))).toBe(false);
  });
  it("отклоняет выход из папки и не-https", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lai-"));
    await expect(downloadFiles([file("../x.gguf", "/a")], { dir, fetch: net, mirrors: u => [u] })).rejects.toThrow(/Недопустимый путь/);
    await expect(downloadFiles([{ ...file("llm/h.gguf", "/a"), url: base + "/a" }], { dir, fetch: net, mirrors: u => [u] })).rejects.toThrow(/https/);
  });
  it("уже скачанный файл не трогает", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lai-"));
    await downloadFiles([file("llm/a.gguf", "/a")], { dir, fetch: net, mirrors: u => [u] }); ranges = [];
    await downloadFiles([file("llm/a.gguf", "/a")], { dir, fetch: net, mirrors: u => [u] });
    expect(ranges).toHaveLength(0);
  });
});
