// Длинные тексты: деление на части по границам абзацев и предложений и разбор «по частям → итог».
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LlmModel } from "./catalog.js";

export interface ChunkOptions {
  /** Максимум символов в части (≈ 3 символа на токен для русского) */
  maxChars?: number;
  /** Сколько символов конца предыдущей части повторить в начале следующей — чтобы не терять контекст на стыке */
  overlap?: number;
}

/** Делит текст на части не длиннее maxChars, стараясь резать по абзацам, затем по предложениям, затем по пробелам. */
export function chunkText(text: string, o: ChunkOptions = {}): string[] {
  const max = Math.max(200, o.maxChars ?? 12000);
  const overlap = Math.min(Math.max(0, o.overlap ?? 0), Math.floor(max / 4));
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t) return [];
  if (t.length <= max) return [t];
  const out: string[] = [];
  let pos = 0;
  while (pos < t.length) {
    let end = Math.min(t.length, pos + max);
    if (end < t.length) {
      const win = t.slice(pos, end);
      const min = Math.floor(max / 2);
      const cut = [win.lastIndexOf("\n\n"), win.lastIndexOf("\n"), Math.max(win.lastIndexOf(". "), win.lastIndexOf("? "), win.lastIndexOf("! ")) + 1, win.lastIndexOf(" ")]
        .find(i => i >= min);
      if (cut !== undefined && cut > 0) end = pos + cut;
    }
    out.push(t.slice(pos, end).trim());
    if (end >= t.length) break;
    let next = end;
    if (overlap) {
      next = Math.max(pos + 1, end - overlap);
      const sp = t.indexOf(" ", next);
      if (sp > 0 && sp < end) next = sp + 1;
    }
    pos = next;
  }
  return out.filter(Boolean);
}

export interface MapReduceOptions<P, R> {
  chunks: string[];
  /** Разбор одной части */
  map: (chunk: string, index: number, count: number) => Promise<P>;
  /** Сведение частичных результатов в итог */
  reduce: (parts: P[]) => Promise<R>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Разбор «по частям → итог»: части обрабатываются по очереди (одна модель — одна очередь). */
export async function mapReduce<P, R>(o: MapReduceOptions<P, R>): Promise<R> {
  const parts: P[] = [];
  for (const [i, c] of o.chunks.entries()) {
    if (o.signal?.aborted) throw abortError();
    parts.push(await o.map(c, i, o.chunks.length));
    o.onProgress?.(i + 1, o.chunks.length);
  }
  if (o.signal?.aborted) throw abortError();
  return o.reduce(parts);
}

export function abortError(): Error {
  const e = new Error("Остановлено пользователем");
  e.name = "AbortError";
  return e;
}

/** Удаляет файл модели (и незавершённую загрузку). Возвращает true, если было что удалять. */
export function removeModel(dir: string, m: LlmModel): boolean {
  let removed = false;
  for (const p of [join(dir, m.file.path), join(dir, m.file.path) + ".part"]) {
    if (existsSync(p)) { rmSync(p, { force: true }); removed = true; }
  }
  return removed;
}
