# local-ai

Общий движок локальных ИИ-моделей для продуктов [kozhevnikovai](https://github.com/kozhevnikovai): [Протоколист](https://github.com/kozhevnikovai/protokolist), [Тендерный помощник](https://github.com/kozhevnikovai/tender-pomoshnik) и следующих. Всё работает на компьютере пользователя — в сеть уходит только однократная загрузка модели.

[English](README.en.md)

## Что умеет

- **Две модели на выбор** — «лёгкая» для обычных ПК и ноутбуков, «мощная» для ПК от 16 ГБ или с видеокартой.
- **Выбор по железу** — смотрит оперативную память и видеокарту, рекомендует модель и объясняет почему; пользователь может выбрать другую.
- **Надёжная загрузка** — докачка после обрыва, проверка места на диске, SHA-256, запасное зеркало, если Hugging Face недоступен.
- **Ответы по JSON-схеме** — llama.cpp на процессоре или видеокарте (CUDA, Vulkan, Metal), без «рассуждений» модели, с защитой от зацикливания.
- **Пути на Windows** — если в имени пользователя кириллица, модели кладутся в `C:\ProgramData\<Программа>`.

## Модели

| Класс | Модель | Размер | Нужно | Лицензия |
|---|---|---|---|---|
| Лёгкая | Qwen3.5 4B (по умолчанию) | 2,7 ГБ | от 8 ГБ ОЗУ | Apache-2.0 |
| Лёгкая | Gemma 4 E4B | 5,0 ГБ | от 8 ГБ ОЗУ | Apache-2.0 |
| Мощная | GigaChat 3.1 Lightning (по умолчанию) | 6,5 ГБ | от 16 ГБ ОЗУ или видеокарта 8 ГБ | MIT |
| Мощная | Qwen3.5 9B | 5,7 ГБ | от 16 ГБ ОЗУ или видеокарта 8 ГБ | Apache-2.0 |

Модели по умолчанию выбираются по результатам evals продуктов. Каждая модель каталога проверяется в CI: загрузка, запуск, ответ на русском по схеме.

## Установка

```bash
npm install github:kozhevnikovai/local-ai node-llama-cpp
```

## Пример

```ts
import { detectHardware, recommend, downloadFiles, loadLocalLLM, appHome, modelsDir } from "@kozhevnikovai/local-ai";
import { join } from "node:path";

const dir = modelsDir(appHome("MyApp"), "MyApp");
const { model, reason } = recommend(await detectHardware());
console.log(reason);
await downloadFiles([model.file], { dir, onProgress: e => console.log(e.done, "/", e.total) });
const llm = await loadLocalLLM({ modelFile: join(dir, model.file.path) });
const out = await llm.json("Выпиши задачи", "Иван, отправь отчёт до пятницы", { type: "object", properties: { tasks: { type: "array", items: { type: "string" } } }, required: ["tasks"] });
await llm.dispose();
```

## Безопасность

Загружаются только https-адреса из каталога, файл с неверной SHA-256 удаляется, пути моделей не выходят за папку моделей. См. [SECURITY.md](SECURITY.md).

## Лицензия

MIT. Веса моделей — под лицензиями их разработчиков (см. таблицу).
