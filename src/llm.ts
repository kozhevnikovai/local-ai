// Запуск локальной модели через llama.cpp и ответы строго по JSON-схеме.
import { abortError } from "./text.js";

export interface LocalLLM {
  name: string;
  device: string;
  json<T>(system: string, user: string, schema: object, maxTokens?: number, opts?: CallOptions): Promise<T>;
  text(system: string, user: string, maxTokens?: number, opts?: CallOptions): Promise<string>;
  dispose(): Promise<void>;
}

export interface CallOptions {
  /** Отмена ответа (кнопка «Стоп»): прерывает генерацию, вызов завершается ошибкой AbortError */
  signal?: AbortSignal;
  /** Текст ответа по мере генерации — для показа «на лету» */
  onText?: (chunk: string) => void;
}

export interface LocalLLMOptions {
  modelFile: string;
  /** "auto" | "cpu" | "cuda" | "vulkan" | "metal" */
  gpu?: string;
  contextSize?: number;
}

export async function loadLocalLLM(o: LocalLLMOptions): Promise<LocalLLM> {
  const { getLlama, LlamaChatSession, QwenChatWrapper, resolveChatWrapper } = await import("node-llama-cpp");
  const gpu = (o.gpu ?? "auto") as any;
  const llama = await getLlama({ gpu: gpu === "cpu" ? false : gpu, logLevel: "error" as any });
  const model = await llama.loadModel({ modelPath: o.modelFile });
  const context = await model.createContext({ contextSize: { max: o.contextSize ?? 12288 } });
  const sequence = context.getSequence();
  const device = llama.gpu ? `GPU (${llama.gpu})` : "CPU";
  // Рассуждения модели («thinking») не нужны: ответ короткий и по схеме, а время на слабом ПК дорого.
  // Qwen: пустой блок рассуждений в шаблоне (иначе ограничение бюджета обрывает ответ на первом символе);
  // остальным моделям — нулевой бюджет на рассуждения.
  // остальным оставляем шаблон, который node-llama-cpp выбирает сам (явный resolveChatWrapper даёт другой результат)
  const qwen = resolveChatWrapper(model) instanceof QwenChatWrapper;
  const chatWrapper = qwen ? new QwenChatWrapper({ thoughts: "discourage" }) : undefined;
  const extra = qwen ? {} : { budgets: { thoughtTokens: 0 } };
  // одна модель — один ответ за раз: параллельные вызовы встают в очередь
  let queue: Promise<unknown> = Promise.resolve();
  const run = (system: string, user: string, opts: Record<string, unknown>, call: CallOptions = {}) => {
    const job = queue.then(() => runNow(system, user, opts, call));
    queue = job.catch(() => undefined);
    return job;
  };
  const runNow = async (system: string, user: string, opts: Record<string, unknown>, call: CallOptions) => {
    if (call.signal?.aborted) throw abortError();
    await sequence.clearHistory();
    const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: system, autoDisposeSequence: false, ...(chatWrapper ? { chatWrapper } : {}) });
    try {
      return await session.prompt(user, { ...extra, ...opts, ...(call.signal ? { signal: call.signal, stopOnAbortSignal: false } : {}), ...(call.onText ? { onTextChunk: call.onText } : {}) } as any);
    } catch (e) {
      if (call.signal?.aborted) throw abortError();
      throw e;
    } finally { session.dispose({ disposeSequence: false }); }
  };
  return {
    name: `${o.modelFile.split(/[\\/]/).pop()} · ${device}`,
    device,
    async json<T>(system: string, user: string, schema: object, maxTokens = 3000, call: CallOptions = {}) {
      const grammar = await llama.createGrammarForJsonSchema(schema as any);
      // маленькие модели иногда зацикливаются внутри строки — штраф за повторы, при сбое вторая попытка строже
      for (const [i, penalty] of [1.1, 1.25].entries()) {
        try {
          const res = await run(system, user, { grammar, temperature: i ? 0 : 0.1, maxTokens, repeatPenalty: { penalty, lastTokens: 128, frequencyPenalty: 0.1 } }, call);
          return grammar.parse(res) as T;
        } catch (e) {
          if ((e as Error).name === "AbortError" || i) throw (e as Error).name === "AbortError" ? e :  new Error(`Модель не смогла выдать корректный ответ: ${(e as Error).message}`);
        }
      }
      throw new Error("недостижимо");
    },
    async text(system: string, user: string, maxTokens = 1500, call: CallOptions = {}) {
      return run(system, user, { temperature: 0.2, maxTokens, repeatPenalty: { penalty: 1.1, lastTokens: 128 } }, call);
    },
    async dispose() { await context.dispose(); await model.dispose(); await llama.dispose(); },
  };
}
