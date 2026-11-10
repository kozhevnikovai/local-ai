// Папки данных и моделей продукта.
import { homedir } from "node:os";
import { join } from "node:path";

/** Папка данных: %LOCALAPPDATA%\<App> на Windows, ~/.<app> на macOS и Linux */
export function appHome(app: string): string {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, app);
  return join(homedir(), "." + app.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
}

/**
 * Папка моделей. llama.cpp и onnxruntime на Windows не открывают пути не на латинице (C:\Users\Егор\…),
 * поэтому для такой папки берём C:\ProgramData\<App>\models.
 */
export function modelsDir(home: string, app: string): string {
  const own = join(home, "models");
  if (process.platform === "win32" && /[^\x00-\x7F]/.test(own)) return join(process.env.ProgramData || "C:\\ProgramData", app, "models");
  return own;
}
