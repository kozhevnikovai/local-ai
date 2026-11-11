// Каталог языковых моделей. Два класса: «лёгкая» — для обычных ПК и ноутбуков (от 8 ГБ ОЗУ, без видеокарты),
// «мощная» — для ПК от 16 ГБ ОЗУ или с видеокартой от 8 ГБ. Размер и SHA-256 — с Hugging Face; файл с другой суммой не принимается.

export type Tier = "light" | "strong";

export interface ModelFile { path: string; url: string; size: number; sha256: string }

export interface LlmModel {
  id: string;
  tier: Tier;
  title: string;
  /** Разработчик и лицензия весов — показываем пользователю */
  vendor: string;
  license: string;
  /** Минимум оперативной памяти для работы на процессоре, ГБ */
  minRamGb: number;
  /** Сколько видеопамяти нужно, чтобы модель целиком поместилась в видеокарту, ГБ */
  fitVramGb: number;
  /** Короткое объяснение для экрана выбора */
  note: string;
  file: ModelFile;
}

const HF = "https://huggingface.co";
const hf = (repo: string, name: string) => `${HF}/${repo}/resolve/main/${name}`;

export const MODELS: LlmModel[] = [
  {
    id: "qwen3-4b", tier: "light", title: "Qwen3 4B Instruct", vendor: "Alibaba Qwen", license: "Apache-2.0",
    minRamGb: 8, fitVramGb: 4, note: "Быстрая и компактная, подходит для ноутбуков",
    file: { path: "llm/qwen3-4b-instruct-2507-q4_k_m.gguf", url: hf("unsloth/Qwen3-4B-Instruct-2507-GGUF", "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"), size: 2497281120, sha256: "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597" },
  },
  {
    id: "qwen3-14b", tier: "strong", title: "Qwen3 14B", vendor: "Alibaba Qwen", license: "Apache-2.0",
    minRamGb: 16, fitVramGb: 11, note: "Точнее всех в наших проверках; с видеокартой заметно быстрее",
    file: { path: "llm/Qwen3-14B-Q4_K_M.gguf", url: hf("unsloth/Qwen3-14B-GGUF", "Qwen3-14B-Q4_K_M.gguf"), size: 9001753984, sha256: "5eaa0870bd81ed3b58a630a271234cfa604e43ffb3a19cd68e54a80dd9d52a66" },
  },
];

/** Модель по умолчанию в каждом классе. Выбирается по evals продуктов; остальные доступны в настройках. */
export const DEFAULTS: Record<Tier, string> = { light: "qwen3-4b", strong: "qwen3-14b" };

export function getModel(id: string): LlmModel {
  const m = MODELS.find(x => x.id === id);
  if (!m) throw new Error(`Неизвестная модель: ${id}. Доступны: ${MODELS.map(x => x.id).join(", ")}`);
  return m;
}
