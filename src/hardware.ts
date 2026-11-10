// Характеристики компьютера и рекомендация модели.
import { cpus, totalmem } from "node:os";
import { DEFAULTS, getModel, MODELS, type LlmModel, type Tier } from "./catalog.js";

export interface Hardware {
  ramGb: number;
  cores: number;
  /** "cuda" | "vulkan" | "metal" | null */
  gpu: string | null;
  vramGb: number;
  /** Apple Silicon: видеокарта использует общую память */
  unified: boolean;
}

const gb = (b: number) => Math.round((b / 1073741824) * 10) / 10;

/** Видеокарту определяет llama.cpp; если он недоступен — считаем, что видеокарты нет. */
export async function detectHardware(): Promise<Hardware> {
  const base = { ramGb: gb(totalmem()), cores: cpus().length, gpu: null as string | null, vramGb: 0, unified: process.platform === "darwin" && process.arch === "arm64" };
  try {
    const { getLlama } = await import("node-llama-cpp");
    const llama = await getLlama({ gpu: "auto", logLevel: "error" as any });
    if (llama.gpu) {
      const v = await llama.getVramState();
      base.gpu = String(llama.gpu);
      base.vramGb = gb(v.total);
    }
    await llama.dispose();
  } catch { /* нет сборки llama.cpp под эту систему — работаем на процессоре */ }
  return base;
}

export interface Recommendation { tier: Tier; model: LlmModel; reason: string; options: { model: LlmModel; ok: boolean; why: string }[] }

/** Подходит ли модель этому компьютеру и почему */
export function fits(m: LlmModel, hw: Hardware): { ok: boolean; why: string } {
  if (hw.gpu && !hw.unified && hw.vramGb >= m.fitVramGb) return { ok: true, why: `поместится в видеокарту (${hw.vramGb} ГБ)` };
  // «16 ГБ» система показывает как 15,6–15,9 ГБ — допуск 5 %
  if (hw.ramGb >= m.minRamGb * 0.95) return { ok: true, why: `хватает оперативной памяти (${hw.ramGb} из ${m.minRamGb} ГБ)` };
  return { ok: false, why: `нужно от ${m.minRamGb} ГБ оперативной памяти или видеокарта от ${m.fitVramGb} ГБ, у вас ${hw.ramGb} ГБ` };
}

export function recommend(hw: Hardware): Recommendation {
  const strong = getModel(DEFAULTS.strong);
  const tier: Tier = fits(strong, hw).ok ? "strong" : "light";
  const model = getModel(DEFAULTS[tier]);
  const reason = tier === "strong"
    ? `Мощная модель: ${fits(strong, hw).why}.`
    : `Лёгкая модель: для мощной ${fits(strong, hw).why}.`;
  return { tier, model, reason, options: MODELS.map(m => ({ model: m, ...fits(m, hw) })) };
}
