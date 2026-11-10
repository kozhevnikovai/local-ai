// Загрузка моделей: докачка с места обрыва (Range), проверка места на диске, SHA-256, запасное зеркало.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statfsSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ModelFile } from "./catalog.js";

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type Progress = (e: { file: string; done: number; total: number; fileDone: number; fileTotal: number; index: number; count: number }) => void;

export interface DownloadOptions {
  dir: string;
  onProgress?: Progress;
  /** Своя функция сети (например, со счётчиком байт продукта). По умолчанию — fetch. */
  fetch?: Fetcher;
  /** Запасные адреса; по умолчанию — зеркало Hugging Face, если основной сайт недоступен */
  mirrors?: (url: string) => string[];
  signal?: AbortSignal;
}

export const defaultMirrors = (url: string) =>
  [url, url.replace("https://huggingface.co/", "https://hf-mirror.com/")].filter((u, i, a) => a.indexOf(u) === i);

export function isPresent(dir: string, f: ModelFile): boolean {
  const p = join(dir, f.path);
  return existsSync(p) && (f.size <= 0 || statSync(p).size === f.size);
}
export const missingFiles = (dir: string, files: ModelFile[]) => files.filter(f => !isPresent(dir, f));
export const totalSize = (files: ModelFile[]) => files.reduce((a, f) => a + f.size, 0);

export async function sha256File(p: string): Promise<string> {
  const h = createHash("sha256");
  await pipeline(createReadStream(p), h);
  return h.digest("hex");
}

const GiB = 1073741824;
/** Нужно на 200 МБ больше, чем осталось скачать */
export function checkSpace(dir: string, need: number) {
  mkdirSync(dir, { recursive: true });
  let free: number;
  try { const st = statfsSync(dir); free = Number(st.bavail) * Number(st.bsize); } catch { return; /* statfs недоступен — не мешаем */ }
  if (free < need + 200 * 1048576) throw new Error(`Не хватает места на диске: нужно ${(need / GiB).toFixed(1)} ГБ, свободно ${(free / GiB).toFixed(1)} ГБ. Освободите место и нажмите «Скачать» ещё раз.`);
}

export async function downloadFiles(files: ModelFile[], o: DownloadOptions): Promise<void> {
  const net: Fetcher = o.fetch ?? ((u, i) => fetch(u, i));
  const mirrors = o.mirrors ?? defaultMirrors;
  const todo = missingFiles(o.dir, files);
  const total = totalSize(todo);
  const partSize = (f: ModelFile) => { const p = join(o.dir, f.path) + ".part"; return existsSync(p) ? statSync(p).size : 0; };
  checkSpace(o.dir, total - todo.reduce((a, f) => a + partSize(f), 0));
  let before = 0;
  for (const [index, f] of todo.entries()) {
    if (!/^[\w.\-/]+$/.test(f.path) || f.path.split("/").includes("..")) throw new Error(`Недопустимый путь модели: ${f.path}`);
    const dest = join(o.dir, f.path);
    const part = dest + ".part";
    mkdirSync(dirname(dest), { recursive: true });
    let lastErr: Error | null = null;
    for (const url of mirrors(f.url)) {
      if (!url.startsWith("https://")) { lastErr = new Error("разрешены только https-адреса"); continue; }
      try {
        let have = partSize(f);
        if (have > f.size) { unlinkSync(part); have = 0; }
        if (have < f.size) {
          const res = await net(url, { redirect: "follow", headers: have ? { Range: `bytes=${have}-` } : {}, signal: o.signal ?? AbortSignal.timeout(60 * 60_000) });
          if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
          if (have && res.status !== 206) have = 0; // сервер не умеет докачку — начинаем заново
          let done = have;
          const src = Readable.fromWeb(res.body as any);
          src.on("data", (c: Buffer) => {
            done += c.length;
            if (done > f.size) src.destroy(new Error("сервер прислал больше данных, чем ожидалось"));
            o.onProgress?.({ file: f.path, fileDone: done, fileTotal: f.size, done: before + done, total, index, count: todo.length });
          });
          await pipeline(src, createWriteStream(part, { flags: have ? "a" : "w" }));
        }
        if (statSync(part).size !== f.size) throw new Error("файл скачан не полностью — нажмите «Скачать» ещё раз, загрузка продолжится");
        if ((await sha256File(part)) !== f.sha256) { unlinkSync(part); throw new Error("контрольная сумма не совпала, файл удалён — скачайте ещё раз"); }
        renameSync(part, dest);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e as Error;
        if (o.signal?.aborted) break;
      }
    }
    if (lastErr) throw new Error(`Не удалось скачать ${f.path}: ${lastErr.message}`);
    before += f.size;
  }
}
