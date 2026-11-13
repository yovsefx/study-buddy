import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, LIB_DIR, now, uid } from "./db.ts";
import { APP_DIR, DEFAULT_MODULE, LIBRARY_IMPORT_DIR, PYTHON, isModule } from "./config.ts";

const run = promisify(execFile);
const EXTRACT = path.join(APP_DIR, "scripts/extract_pdf.py");

export type Doc = {
  id: string; module: string; title: string; filename: string; path: string; kind: string;
  pages: number; status: string; scanned: string; error: string | null; created: number;
};

/** Extract the text of every page (PyMuPDF) and (re)build the document's full-text index. */
async function indexDoc(doc: Doc) {
  try {
    const { stdout } = await run(PYTHON, ["-I", EXTRACT, doc.path], { maxBuffer: 512 * 1024 * 1024 });
    const r = JSON.parse(stdout) as { pages: number; text: string[]; scanned: number[] };
    db.prepare("DELETE FROM pages_fts WHERE doc_id = ?").run(doc.id);
    const ins = db.prepare("INSERT INTO pages_fts(doc_id, page, text) VALUES(?, ?, ?)");
    db.exec("BEGIN");
    r.text.forEach((t, i) => { if (t.trim()) ins.run(doc.id, i + 1, t); });
    db.exec("COMMIT");
    db.prepare("UPDATE documents SET status = 'ready', pages = ?, scanned = ? WHERE id = ?").run(r.pages, JSON.stringify(r.scanned), doc.id);
  } catch (e) {
    db.prepare("UPDATE documents SET status = 'error', error = ? WHERE id = ?").run(String(e).slice(0, 500), doc.id);
  }
}

/** Copy (or move) a PDF into the library and index it in the background. */
export function addDocument(o: { src: string; filename: string; module: string; title?: string; kind?: string; move?: boolean }): Doc {
  const module = isModule(o.module) ? o.module : DEFAULT_MODULE;
  const id = uid();
  const dir = path.join(LIB_DIR, module);
  fs.mkdirSync(dir, { recursive: true });
  const safe = o.filename.replace(/[^\w.\-äöüÄÖÜß ]+/g, "_").slice(-120);
  const dest = path.join(dir, `${id}-${safe}`);
  if (o.move) fs.renameSync(o.src, dest); else fs.copyFileSync(o.src, dest);
  const title = (o.title || o.filename.replace(/\.pdf$/i, "")).slice(0, 200);
  db.prepare("INSERT INTO documents(id, module, title, filename, path, kind, created) VALUES(?, ?, ?, ?, ?, ?, ?)")
    .run(id, module, title, o.filename, dest, o.kind || "buch", now());
  const doc = getDoc(id)!;
  void indexDoc(doc);
  return doc;
}

export const getDoc = (id: string) => db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as Doc | undefined;
export const listDocs = (module?: string) =>
  (module
    ? db.prepare("SELECT * FROM documents WHERE module = ? ORDER BY created DESC").all(module)
    : db.prepare("SELECT * FROM documents ORDER BY module, created DESC").all()) as Doc[];

export function deleteDoc(id: string) {
  const d = getDoc(id);
  if (!d) return false;
  db.prepare("DELETE FROM pages_fts WHERE doc_id = ?").run(id);
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  fs.rmSync(d.path, { force: true });
  return true;
}

/** Full-text search over all pages: each word is a prefix match, words are OR-ed, results ranked by BM25. */
export function search(query: string, module?: string, limit = 8) {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  if (!words.length) return [];
  const fts = [...new Set(words)].slice(0, 12).map((w) => `"${w}"*`).join(" OR ");
  const rows = db.prepare(`
    SELECT p.doc_id, p.page, snippet(pages_fts, 2, '«', '»', ' … ', 40) AS snip, bm25(pages_fts) AS score,
           d.title, d.module, d.path, d.kind
    FROM pages_fts p JOIN documents d ON d.id = p.doc_id
    WHERE pages_fts MATCH ? ${module ? "AND d.module IN (?, ?)" : ""}
    ORDER BY score LIMIT ?`).all(...(module ? [fts, module, DEFAULT_MODULE, limit] : [fts, limit])) as any[];
  return rows.map((r) => ({ doc_id: r.doc_id, title: r.title, module: r.module, kind: r.kind, page: r.page, path: r.path, snippet: r.snip }));
}

/** Extracted text of up to 10 pages of one document. */
export function pageText(docId: string, from: number, to: number) {
  return db.prepare("SELECT page, text FROM pages_fts WHERE doc_id = ? AND page BETWEEN ? AND ? ORDER BY page")
    .all(docId, from, Math.min(to, from + 9)) as { page: number; text: string }[];
}

/** On start: import PDFs dropped into library/<module-id>/ that are not in the library yet. */
export function importLibraryFolder() {
  if (!fs.existsSync(LIBRARY_IMPORT_DIR)) return;
  const known = db.prepare("SELECT 1 FROM documents WHERE filename = ? AND module = ?");
  for (const dir of fs.readdirSync(LIBRARY_IMPORT_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const module = isModule(dir.name) ? dir.name : DEFAULT_MODULE;
    for (const f of fs.readdirSync(path.join(LIBRARY_IMPORT_DIR, dir.name))) {
      if (!f.toLowerCase().endsWith(".pdf") || known.get(f, module)) continue;
      addDocument({ src: path.join(LIBRARY_IMPORT_DIR, dir.name, f), filename: f, module, kind: "skript" });
    }
  }
}
