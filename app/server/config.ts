import fs from "node:fs";
import path from "node:path";

/** Repository layout: app/ (this server + web UI), video/ (Remotion project), .venv/ (Python tools). */
export const APP_DIR = path.resolve(import.meta.dirname, "..");
export const REPO_DIR = path.resolve(APP_DIR, "..");
export const VIDEO_DIR_PROJECT = path.join(REPO_DIR, "video");
/** PDFs dropped here (library/<module-id>/*.pdf) are imported on start. */
export const LIBRARY_IMPORT_DIR = path.resolve(process.env.LIBRARY_DIR || path.join(REPO_DIR, "library"));

/** Where the database, uploads, library copies and rendered videos live. */
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(APP_DIR, "data"));
/** Python interpreter with pymupdf and edge-tts installed (see requirements.txt). */
export const PYTHON = process.env.PYTHON || path.join(REPO_DIR, ".venv/bin/python");
/** Optional path prefix when the app is served below a sub-path, e.g. /study. */
export const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");
export const MODEL = process.env.STUDY_MODEL || "claude-opus-5-5";

export type Module = { id: string; name: string; icon: string; color: string; semester: number; handbook: string };

/** app.json, modules.json and student.md (each falls back to its *.example file). */
const CONFIG_DIR = path.resolve(process.env.CONFIG_DIR || path.join(APP_DIR, "config"));

/** Read config/<name>, falling back to config/<example> so a fresh clone runs with sample data. */
function readConfig(name: string, example: string) {
  const own = path.join(CONFIG_DIR, name);
  return fs.readFileSync(fs.existsSync(own) ? own : path.join(CONFIG_DIR, example), "utf8");
}

/** Study modules (subjects). Must contain a module with id "allgemein" as the general fallback. */
export const MODULES: Module[] = JSON.parse(readConfig("modules.json", "modules.example.json"));
if (!MODULES.some((m) => m.id === "allgemein")) {
  MODULES.push({ id: "allgemein", name: "Allgemein", icon: "messages-square", color: "#64748b", semester: 0, handbook: "" });
}
export const DEFAULT_MODULE = "allgemein";

/** App defaults: the starting UI/answer language ("de" | "en" | "ar"), and optionally the language in which
    technical terms are added in brackets (useful when the exams are in another language than the answers). */
export const APP_SETTINGS: { lang: "de" | "en" | "ar"; termLanguage: string | null } = { lang: "en", termLanguage: null, ...JSON.parse(readConfig("app.json", "app.example.json")) };
export const DEFAULT_LANG = APP_SETTINGS.lang;

/** A few sentences about the learner (what and where they study); inserted into the tutor prompt. */
export const STUDENT_PROFILE = readConfig("student.md", "student.example.md").trim();

export const moduleIds = () => MODULES.map((m) => m.id);
export const moduleName = (id: string) => MODULES.find((m) => m.id === id)?.name ?? id;
export const isModule = (id: unknown): id is string => typeof id === "string" && MODULES.some((m) => m.id === id);
