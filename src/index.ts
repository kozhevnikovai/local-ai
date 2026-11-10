export { MODELS, DEFAULTS, getModel, type LlmModel, type ModelFile, type Tier } from "./catalog.js";
export { detectHardware, recommend, fits, type Hardware, type Recommendation } from "./hardware.js";
export { downloadFiles, missingFiles, isPresent, totalSize, checkSpace, sha256File, defaultMirrors, type DownloadOptions, type Fetcher, type Progress } from "./download.js";
export { appHome, modelsDir } from "./paths.js";
export { loadLocalLLM, type LocalLLM, type LocalLLMOptions } from "./llm.js";
