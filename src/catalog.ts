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
    id: "gemma-4-e4b", tier: "light", title: "Gemma 4 E4B", vendor: "Google", license: "Apache-2.0",
    minRamGb: 8, fitVramGb: 6, note: "Компактная, хорошо держит длинные документы",
    file: { path: "llm/gemma-4-E4B-it-Q4_K_M.gguf", url: hf("unsloth/gemma-4-E4B-it-GGUF", "gemma-4-E4B-it-Q4_K_M.gguf"), size: 4977171584, sha256: "85a896a047553e842f25297ee5b031d64ff30147d9c4af17b1e4b394cd1fab87" },
  },
  {
    id: "gigachat-3.1-lightning", tier: "strong", title: "GigaChat 3.1 Lightning", vendor: "Сбер", license: "MIT",
    minRamGb: 16, fitVramGb: 8, note: "Сильная в русском языке; быстрая даже без видеокарты",
    file: { path: "llm/GigaChat3.1-10B-A1.8B-q4_K_M.gguf", url: hf("ai-sage/GigaChat3.1-10B-A1.8B-GGUF", "GigaChat3.1-10B-A1.8B-q4_K_M.gguf"), size: 6474702976, sha256: "68a8732fb5cee04f83ebffd7924e15c534d4442c5a43d2ba9e2041fe310b8deb" },
  },
  {
    id: "gemma-4-12b", tier: "strong", title: "Gemma 4 12B", vendor: "Google", license: "Apache-2.0",
    minRamGb: 16, fitVramGb: 10, note: "Самая подробная; лучше всего с видеокартой от 10 ГБ",
    file: { path: "llm/gemma-4-12b-it-Q4_K_M.gguf", url: hf("unsloth/gemma-4-12b-it-GGUF", "gemma-4-12b-it-Q4_K_M.gguf"), size: 7121861440, sha256: "0a270ec9fe6b34f4a0d33992b6135117b484ebc4766ab76b51d4ae8c457e4c42" },
  },
];

/** Модель по умолчанию в каждом классе. Выбирается по evals продуктов; остальные доступны в настройках. */
export const DEFAULTS: Record<Tier, string> = { light: "qwen3-4b", strong: "gigachat-3.1-lightning" };

export function getModel(id: string): LlmModel {
  const m = MODELS.find(x => x.id === id);
  if (!m) throw new Error(`Неизвестная модель: ${id}. Доступны: ${MODELS.map(x => x.id).join(", ")}`);
  return m;
}
