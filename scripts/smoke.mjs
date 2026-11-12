// Проверка модели из каталога: скачать, запустить llama.cpp, получить ответ по JSON-схеме на русском.
// Запуск: npm run smoke -- <id модели>   (папка моделей — LOCAL_AI_MODELS или ./.smoke)
import { downloadFiles, getModel, loadLocalLLM } from "../dist/index.js";
import { join, resolve } from "node:path";

const id = process.argv[2];
const m = getModel(id);
const dir = resolve(process.env.LOCAL_AI_MODELS || ".smoke");
let last = 0;
await downloadFiles([m.file], { dir, onProgress: e => { const p = Math.floor(e.done / e.total * 10); if (p > last) { last = p; console.log(`загрузка ${p * 10}%`); } } });
const t0 = Date.now();
const llm = await loadLocalLLM({ modelFile: join(dir, m.file.path), gpu: process.env.LOCAL_AI_GPU || "cpu", contextSize: 4096 });
const load = (Date.now() - t0) / 1000;
const schema = { type: "object", properties: { tasks: { type: "array", items: { type: "object", properties: { text: { type: "string" }, owner: { type: "string" }, due: { type: "string" } }, required: ["text", "owner", "due"] } } }, required: ["tasks"] };
const user = "Стенограмма:\nАнна: Иван, подготовь коммерческое предложение для «Ромашки» до 15 декабря.\nИван: Хорошо, сделаю. А ты, Анна, согласуй цены с бухгалтерией до пятницы, 12 декабря.\nАнна: Договорились.";
const t1 = Date.now();
const out = await llm.json("Выпиши задачи из стенограммы встречи. Дата срока — в формате ГГГГ-ММ-ДД, год 2026.", user, schema, 400);
const sec = (Date.now() - t1) / 1000;
console.log(JSON.stringify(out, null, 1));
// поток текста и остановка: модель начинает отвечать, после первых кусков — «Стоп»
const ac = new AbortController(); let chunks = 0; let aborted = false;
try { await llm.text("Ответь подробно.", "Перечисли 30 городов России по одному в строке.", 600, { signal: ac.signal, onText: () => { if (++chunks === 5) ac.abort(); } }); }
catch (e) { aborted = e.name === "AbortError"; }
console.log(`поток: ${chunks} кусков, остановка: ${aborted ? "да" : "НЕТ"}`);
await llm.dispose();
const ok = aborted && chunks >= 5 && chunks < 60 && out.tasks?.length === 2 && out.tasks.some(t => /иван/i.test(t.owner) && t.due === "2026-12-15") && out.tasks.some(t => /анн/i.test(t.owner) && t.due === "2026-12-12");
console.log(`${m.title}: ${llm.device}, загрузка ${load.toFixed(1)} с, ответ ${sec.toFixed(1)} с, ${ok ? "верно" : "ОШИБКА в ответе"}`);
if (!ok) process.exit(1);
