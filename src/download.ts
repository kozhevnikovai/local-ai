// Загрузка моделей: докачка с места обрыва (Range), проверка места на диске, SHA-256, запасное зеркало.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statfsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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

/** Ближайшая существующая папка на пути к p — чтобы сравнить реальный путь (с учётом ссылок и junction) с корнем */
function existingAncestor(p: string): string {
  let cur = p;
  while (!existsSync(cur)) { const up = dirname(cur); if (up === cur) break; cur = up; }
  return cur;
}
const inside = (root: string, p: string) => { const r = relative(root, p); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

/**
 * Путь файла модели внутри папки моделей. Отказ, если путь содержит «..», недопустимые символы
 * или через символическую ссылку / junction уводит за пределы папки.
 */
export function modelFilePath(dir: string, rel: string): string {
  if (!/^[\w.\-/]+$/.test(rel) || rel.split("/").some(s => s === ".." || s === "") || rel.startsWith("/")) throw new Error(`Недопустимый путь модели: ${rel}`);
  const root = resolve(dir);
  const p = resolve(root, rel);
  if (!inside(root, p)) throw new Error(`Недопустимый путь модели: ${rel}`);
  if (existsSync(root)) {
    const realRoot = realpathSync(root);
    const anc = existingAncestor(p);
    if (!inside(realRoot, realpathSync(anc))) throw new Error(`Путь модели ведёт за пределы папки моделей: ${rel}`);
  }
  return p;
}

/** Отметка «файл проверен по SHA-256»: размер и время изменения на момент проверки */
const stampPath = (p: string) => p + ".verified";
function stampOk(p: string, f: ModelFile): boolean {
  try {
    const st = statSync(p);
    const [sha, size, mtime] = readFileSync(stampPath(p), "utf8").trim().split(" ");
    return sha === f.sha256 && Number(size) === st.size && Number(mtime) === Math.floor(st.mtimeMs);
  } catch { return false; }
}
function writeStamp(p: string, f: ModelFile) {
  const st = statSync(p);
  try { writeFileSync(stampPath(p), `${f.sha256} ${st.size} ${Math.floor(st.mtimeMs)}\n`); } catch { /* папка только для чтения — проверим в следующий раз */ }
}

/**
 * Быстрая проверка наличия: файл есть и размер совпадает. Это не проверка целостности —
 * содержимое проверяет verifyFiles (SHA-256, результат кэшируется до изменения файла).
 */
export function isPresent(dir: string, f: ModelFile): boolean {
  const p = modelFilePath(dir, f.path);
  return existsSync(p) && (f.size <= 0 || statSync(p).size === f.size);
}

/**
 * Проверяет SHA-256 уже скачанных файлов. Проверенный файл помечается и при следующем запуске
 * не пересчитывается, пока не изменится. Файл с неверной суммой удаляется — его нужно скачать заново.
 * Возвращает файлы, которые не прошли проверку.
 */
export async function verifyFiles(dir: string, files: ModelFile[], onFile?: (path: string, index: number, count: number) => void): Promise<ModelFile[]> {
  const bad: ModelFile[] = [];
  for (const [i, f] of files.entries()) {
    const p = modelFilePath(dir, f.path);
    if (!existsSync(p)) continue;
    if (stampOk(p, f)) continue;
    onFile?.(f.path, i, files.length);
    if ((f.size > 0 && statSync(p).size !== f.size) || (await sha256File(p)) !== f.sha256) {
      unlinkSync(p);
      try { unlinkSync(stampPath(p)); } catch { /* отметки не было */ }
      bad.push(f);
    } else writeStamp(p, f);
  }
  return bad;
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
  // файлы правильного размера, но без подтверждённой суммы, проверяются по SHA-256 до скачивания (без сети)
  await verifyFiles(o.dir, files.filter(f => isPresent(o.dir, f)));
  const todo = missingFiles(o.dir, files);
  const total = totalSize(todo);
  const partSize = (f: ModelFile) => { const p = modelFilePath(o.dir, f.path) + ".part"; return existsSync(p) ? statSync(p).size : 0; };
  checkSpace(o.dir, total - todo.reduce((a, f) => a + partSize(f), 0));
  let before = 0;
  for (const [index, f] of todo.entries()) {
    const dest = modelFilePath(o.dir, f.path);
    const part = dest + ".part";
    mkdirSync(dirname(dest), { recursive: true });
    modelFilePath(o.dir, f.path); // повторная проверка после создания папок
    const urls = mirrors(f.url);
    if (!urls.length) throw new Error(`Не удалось скачать ${f.path}: не задано ни одного адреса`);
    let lastErr: Error | null = null;
    for (const url of urls) {
      if (!url.startsWith("https://")) { lastErr = new Error("разрешены только https-адреса"); continue; }
      try {
        let have = partSize(f);
        if (have > f.size) { unlinkSync(part); have = 0; }
        if (have < f.size) {
          const res = await httpsGet(net, url, have ? { Range: `bytes=${have}-` } : {}, o.signal ?? AbortSignal.timeout(60 * 60_000));
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
        writeStamp(dest, f);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e as Error;
        if (o.signal?.aborted) break;
      }
    }
    if (lastErr) throw new Error(`Не удалось скачать ${f.path}: ${lastErr.message}`);
    if (!existsSync(dest)) throw new Error(`Не удалось скачать ${f.path}: файл не появился`);
    before += f.size;
  }
}

/** GET с ручной обработкой переадресаций: каждый переход — только на https, не больше 10 переходов */
async function httpsGet(net: Fetcher, url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Response> {
  let cur = url;
  for (let hop = 0; hop <= 10; hop++) {
    if (!cur.startsWith("https://")) throw new Error("переадресация на небезопасный адрес (не https) отклонена");
    const res = await net(cur, { redirect: "manual", headers, signal });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel().catch(() => undefined);
      cur = new URL(res.headers.get("location")!, cur).toString();
      continue;
    }
    return res;
  }
  throw new Error("слишком много переадресаций");
}
