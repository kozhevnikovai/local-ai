// Запись настоящего сеанса для GIF: каждая строка вывода с отметкой времени → media/cast.json
import { detectHardware, recommend, getModel, downloadFiles, loadLocalLLM } from "../../dist/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const cast = [], t0 = Date.now();
const out = (s, kind = "out") => { cast.push({ t: (Date.now() - t0) / 1000, kind, s }); console.log(s); };
out(`node demo.mjs`, "cmd");
const hw = await detectHardware(), rec = recommend(hw);
out(`Компьютер: ${hw.cores} ядра, ${hw.ramGb} ГБ ОЗУ, видеокарта: ${hw.gpu ?? "нет"}`);
out(`Подходит: ${rec.model.title} — ${rec.reason}`);
const m = rec.model, dir = resolve(process.env.LOCAL_AI_MODELS || ".smoke");
await downloadFiles([m.file], { dir });
out(`Модель на диске, SHA-256 сверен ✓`);
const llm = await loadLocalLLM({ modelFile: join(dir, m.file.path), gpu: "cpu", contextSize: 4096 });
out(`Загружена за ${((Date.now() - t0) / 1000).toFixed(1)} с · ${llm.device}`);
out(`> Выпиши задачи из стенограммы (JSON-схема)`, "cmd");
const schema = { type: "object", properties: { tasks: { type: "array", items: { type: "object", properties: { text: { type: "string" }, owner: { type: "string" }, due: { type: "string" } }, required: ["text", "owner", "due"] } } }, required: ["tasks"] };
const user = "Стенограмма:\nАнна: Иван, подготовь коммерческое предложение для «Ромашки» до 15 декабря.\nИван: Хорошо, сделаю. А ты, Анна, согласуй цены с бухгалтерией до пятницы, 12 декабря.\nАнна: Договорились.";
const r = await llm.json("Выпиши задачи из стенограммы встречи. Дата срока — в формате ГГГГ-ММ-ДД, год 2026.", user, schema, 400);
for (const t of r.tasks) out(`  { owner: "${t.owner}", due: "${t.due}", text: "${t.text}" }`);
out(`> Поток ответа и «Стоп»`, "cmd");
const ac = new AbortController(); let n = 0, buf = "";
try { await llm.text("Отвечай кратко.", "Перечисли 30 городов России через запятую.", 600, { signal: ac.signal, onText: s => { buf += s; cast.push({ t: (Date.now() - t0) / 1000, kind: "stream", s }); if (++n === 14) ac.abort(); } }); } catch (e) { if (e.name !== "AbortError") out("ошибка: " + e.message); }
out(`\n  [Стоп] — остановлено после ${n} кусков`);
await llm.dispose();
mkdirSync("media", { recursive: true }); writeFileSync("media/cast.json", JSON.stringify(cast, null, 1));
