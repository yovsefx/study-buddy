import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.ts";

/** All app state lives in one SQLite file plus three folders under DATA_DIR. */
export const LIB_DIR = path.join(DATA_DIR, "library");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const VIDEO_DIR = path.join(DATA_DIR, "videos");
for (const d of [DATA_DIR, LIB_DIR, UPLOAD_DIR, VIDEO_DIR]) fs.mkdirSync(d, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "study.sqlite"));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, module TEXT NOT NULL DEFAULT 'allgemein',
  session_id TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, attachments TEXT NOT NULL DEFAULT '[]', meta TEXT NOT NULL DEFAULT '{}',
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, module TEXT NOT NULL, title TEXT NOT NULL, filename TEXT NOT NULL,
  path TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'buch', pages INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing', scanned TEXT NOT NULL DEFAULT '[]', error TEXT,
  created INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  doc_id UNINDEXED, page UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY, chat_id TEXT, message_id INTEGER, title TEXT NOT NULL, style TEXT NOT NULL,
  status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, path TEXT, error TEXT,
  duration REAL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// pages_fts holds one row per PDF page; remove_diacritics makes the search accent-insensitive.

export const now = () => Date.now();
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const getSetting = (key: string, def: string) =>
  (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? def;
export const setSetting = (key: string, value: string) =>
  db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
