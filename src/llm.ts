// Запуск локальной модели через llama.cpp и ответы строго по JSON-схеме.
export interface LocalLLM {
  name: string;
  device: string;
  json<T>(system: string, user: string, schema: object, maxTokens?: number): Promise<T>;
  text(system: string, user: string, maxTokens?: number): Promise<string>;
  dispose(): Promise<void>;
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
  const base = resolveChatWrapper(model);
  const qwen = base instanceof QwenChatWrapper;
  const chatWrapper = qwen ? new QwenChatWrapper({ thoughts: "discourage" }) : base;
  const extra = qwen ? {} : { budgets: { thoughtTokens: 0 } };
  const run = async (system: string, user: string, opts: Record<string, unknown>) => {
    await sequence.clearHistory();
    const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: system, autoDisposeSequence: false, ...(chatWrapper ? { chatWrapper } : {}) });
    try { return await session.prompt(user, { ...extra, ...opts } as any); }
    finally { session.dispose({ disposeSequence: false }); }
  };
  return {
    name: `${o.modelFile.split(/[\\/]/).pop()} · ${device}`,
    device,
    async json<T>(system: string, user: string, schema: object, maxTokens = 3000) {
      const grammar = await llama.createGrammarForJsonSchema(schema as any);
      // маленькие модели иногда зацикливаются внутри строки — штраф за повторы, при сбое вторая попытка строже
      for (const [i, penalty] of [1.1, 1.25].entries()) {
        try {
          const res = await run(system, user, { grammar, temperature: i ? 0 : 0.1, maxTokens, repeatPenalty: { penalty, lastTokens: 128, frequencyPenalty: 0.1 } });
          return grammar.parse(res) as T;
        } catch (e) {
          if (i) throw new Error(`Модель не смогла выдать корректный ответ: ${(e as Error).message}`);
        }
      }
      throw new Error("недостижимо");
    },
    async text(system: string, user: string, maxTokens = 1500) {
      return run(system, user, { temperature: 0.2, maxTokens, repeatPenalty: { penalty: 1.1, lastTokens: 128 } });
    },
    async dispose() { await context.dispose(); await model.dispose(); await llama.dispose(); },
  };
}
