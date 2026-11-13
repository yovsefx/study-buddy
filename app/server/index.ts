import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, getSetting, now, setSetting, uid, UPLOAD_DIR } from "./db.ts";
import { APP_DIR, BASE_PATH, DEFAULT_LANG, DEFAULT_MODULE, MODULES, PYTHON, isModule } from "./config.ts";
import { addDocument, deleteDoc, getDoc, importLibraryFolder, listDocs } from "./library.ts";
import { getVideo, listVideos, resumeQueue } from "./video.ts";
import { runTurn, type Attachment, type TurnEvent } from "./agent.ts";

const run = promisify(execFile);
const PORT = Number(process.env.PORT || 3000);
const PASSWORD = process.env.STUDY_PASSWORD || "";
const SECRET = process.env.STUDY_SECRET || crypto.randomBytes(32).toString("hex");
if (!PASSWORD) { console.error("STUDY_PASSWORD fehlt"); process.exit(1); }
const TOKEN = crypto.createHmac("sha256", SECRET).update("study-buddy:" + PASSWORD).digest("hex");
const COOKIE = "sb_auth";

const app = express();
app.disable("x-powered-by");
// Only trust a reverse proxy on this machine (e.g. a tunnel or nginx on 127.0.0.1), so https detection
// works but nobody on the internet can spoof X-Forwarded-For to dodge the login rate limit.
app.set("trust proxy", "loopback");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

const api = express.Router();

/** Real client IP: behind Cloudflare it arrives in CF-Connecting-IP (set by Cloudflare, not by the client). */
function clientIp(req: express.Request) {
  const remote = req.socket.remoteAddress ?? "";
  const local = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  const cf = req.get("cf-connecting-ip");
  return (local && cf) ? cf : (req.ip ?? remote);
}
/** Was the original request https? Via X-Forwarded-Proto (trust proxy) or Cloudflare's CF-Visitor header. */
function isHttps(req: express.Request) {
  const remote = req.socket.remoteAddress ?? "";
  const local = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  return req.secure || (local && /"scheme":"https"/.test(req.get("cf-visitor") ?? ""));
}

// ---------- Login with rate limiting ----------
// 5 failures per IP per 15 minutes, plus 30 failures in total (against rotating IPs).
const WINDOW = 15 * 60_000, PER_IP = 5, GLOBAL = 30;
const fails = new Map<string, number[]>();
let globalFails: number[] = [];
const recent = (list: number[] | undefined) => (list ?? []).filter((t) => Date.now() - t < WINDOW);
const sha = (s: string) => crypto.createHash("sha256").update(s).digest();

api.post("/login", (req, res) => {
  const ip = clientIp(req);
  const mine = recent(fails.get(ip));
  globalFails = recent(globalFails);
  if (mine.length >= PER_IP || globalFails.length >= GLOBAL) {
    const oldest = Math.min(...(mine.length >= PER_IP ? mine : globalFails));
    const wait = Math.ceil((oldest + WINDOW - Date.now()) / 1000);
    res.setHeader("Retry-After", String(wait));
    return res.status(429).json({ error: `Zu viele Versuche. Bitte in ${Math.ceil(wait / 60)} Minuten nochmal.` });
  }
  const pw = String(req.body?.password ?? "").slice(0, 200);
  const ok = crypto.timingSafeEqual(sha(pw), sha(PASSWORD));
  if (!ok) {
    mine.push(Date.now());
    fails.set(ip, mine);
    globalFails.push(Date.now());
    console.warn(`Login fehlgeschlagen von ${ip} (${mine.length}/${PER_IP})`);
    return res.status(401).json({ error: "Falsches Passwort" });
  }
  fails.delete(ip);
  res.cookie(COOKIE, TOKEN, { httpOnly: true, sameSite: "lax", secure: isHttps(req), maxAge: 1000 * 60 * 60 * 24 * 180, path: "/" });
  res.json({ ok: true });
});
api.post("/logout", (_req, res) => { res.clearCookie(COOKIE, { path: "/" }); res.json({ ok: true }); });
api.use((req, res, next) => {
  const c = req.cookies?.[COOKIE];
  if (typeof c === "string" && c.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(TOKEN))) return next();
  res.status(401).json({ error: "login" });
});

// ---------- Settings, modules, learner memory ----------
api.get("/me", (_req, res) => res.json({ ok: true, lang: getSetting("lang", DEFAULT_LANG), name: getSetting("name", "") }));
api.put("/settings", (req, res) => {
  const lang = String(req.body?.lang ?? "");
  if (["de", "en", "ar"].includes(lang)) setSetting("lang", lang);
  if (typeof req.body?.name === "string") setSetting("name", req.body.name.replace(/[\r\n]/g, " ").trim().slice(0, 40));
  res.json({ lang: getSetting("lang", DEFAULT_LANG), name: getSetting("name", "") });
});
api.get("/modules", (_req, res) => {
  const counts = db.prepare("SELECT module, COUNT(*) AS n FROM documents GROUP BY module").all() as { module: string; n: number }[];
  res.json(MODULES.map(({ handbook, ...m }) => ({ ...m, docs: counts.find((c) => c.module === m.id)?.n ?? 0 })));
});
api.get("/profile", (_req, res) => res.json(db.prepare("SELECT * FROM profile ORDER BY id").all()));
api.delete("/profile/:id", (req, res) => { db.prepare("DELETE FROM profile WHERE id = ?").run(Number(req.params.id)); res.json({ ok: true }); });

// ---------- Chats ----------
type Turn = { events: TurnEvent[]; subs: Set<express.Response>; done: boolean };
const turns = new Map<string, Turn>();

const parseMsg = (m: any) => ({ ...m, attachments: JSON.parse(m.attachments), meta: JSON.parse(m.meta) });

api.get("/chats", (_req, res) => res.json(db.prepare("SELECT id, title, module, created, updated FROM chats ORDER BY updated DESC").all()));
api.post("/chats", (req, res) => {
  const id = uid();
  const module = isModule(req.body?.module) ? req.body.module : DEFAULT_MODULE;
  db.prepare("INSERT INTO chats(id, title, module, created, updated) VALUES(?, ?, ?, ?, ?)").run(id, "Neuer Chat", module, now(), now());
  res.json(db.prepare("SELECT * FROM chats WHERE id = ?").get(id));
});
api.get("/chats/:id", (req, res) => {
  const chat = db.prepare("SELECT id, title, module, created, updated FROM chats WHERE id = ?").get(req.params.id);
  if (!chat) return res.status(404).json({ error: "not found" });
  const messages = (db.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY id").all(req.params.id) as any[]).map(parseMsg);
  const t = turns.get(req.params.id);
  res.json({ chat, messages, videos: listVideos(req.params.id), running: !!t && !t.done });
});
api.patch("/chats/:id", (req, res) => {
  if (typeof req.body?.title === "string") db.prepare("UPDATE chats SET title = ? WHERE id = ?").run(req.body.title.slice(0, 80), req.params.id);
  if (isModule(req.body?.module)) db.prepare("UPDATE chats SET module = ? WHERE id = ?").run(req.body.module, req.params.id);
  res.json({ ok: true });
});
api.delete("/chats/:id", (req, res) => {
  db.prepare("DELETE FROM messages WHERE chat_id = ?").run(req.params.id);
  db.prepare("DELETE FROM chats WHERE id = ?").run(req.params.id);
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(req.params.id)), { recursive: true, force: true });
  res.json({ ok: true });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      const dir = path.join(UPLOAD_DIR, path.basename(String(req.params.id ?? "library")));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, f, cb) => {
      const name = Buffer.from(f.originalname, "latin1").toString("utf8");
      cb(null, `${uid()}-${name.replace(/[^\w.\-äöüÄÖÜß ]+/g, "_").slice(-100)}`);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024, files: 10 },
});

async function pdfPages(p: string) {
  try {
    const { stdout } = await run(PYTHON, ["-I", "-c", "import sys, pymupdf; print(len(pymupdf.open(sys.argv[1])))", p]);
    return Number(stdout.trim()) || undefined;
  } catch { return undefined; }
}

api.post("/chats/:id/messages", upload.array("files", 10), async (req, res) => {
  const chatId = req.params.id;
  const chat = db.prepare("SELECT id FROM chats WHERE id = ?").get(chatId);
  if (!chat) return res.status(404).json({ error: "not found" });
  if (turns.get(chatId) && !turns.get(chatId)!.done) return res.status(409).json({ error: "busy" });
  const text = String(req.body?.text ?? "").slice(0, 20000);
  const files = (req.files as Express.Multer.File[]) ?? [];
  const atts: Attachment[] = [];
  for (const f of files) {
    const name = Buffer.from(f.originalname, "latin1").toString("utf8");
    const a: Attachment = { name, path: f.path, mime: f.mimetype, size: f.size };
    if (f.mimetype === "application/pdf") a.pages = await pdfPages(f.path);
    atts.push(a);
  }
  if (!text.trim() && !atts.length) return res.status(400).json({ error: "empty" });
  const pub = atts.map((a) => ({ name: a.name, file: path.basename(a.path), mime: a.mime, size: a.size, pages: a.pages }));
  const r = db.prepare("INSERT INTO messages(chat_id, role, content, attachments, created) VALUES(?, 'user', ?, ?, ?)").run(chatId, text, JSON.stringify(pub), now());
  db.prepare("UPDATE chats SET updated = ? WHERE id = ?").run(now(), chatId);

  const turn: Turn = { events: [], subs: new Set(), done: false };
  turns.set(chatId, turn);
  const emit = (e: TurnEvent) => {
    turn.events.push(e);
    for (const s of turn.subs) s.write(`data: ${JSON.stringify(e)}\n\n`);
    if (e.type === "done") {
      turn.done = true;
      for (const s of turn.subs) s.end();
      turn.subs.clear();
      setTimeout(() => { if (turns.get(chatId) === turn) turns.delete(chatId); }, 60_000);
    }
  };
  res.json({ ok: true, messageId: Number(r.lastInsertRowid) });
  runTurn(chatId, text, atts, emit).catch((e) => { emit({ type: "error", text: String(e) }); emit({ type: "done", messageId: -1 }); });
});

api.get("/chats/:id/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const t = turns.get(req.params.id);
  if (!t || t.done) { res.write(`data: ${JSON.stringify({ type: "idle" })}\n\n`); return res.end(); }
  for (const e of t.events) res.write(`data: ${JSON.stringify(e)}\n\n`);
  t.subs.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => { clearInterval(ping); t.subs.delete(res); });
});

api.get("/files/:chat/:file", (req, res) => {
  const p = path.join(UPLOAD_DIR, path.basename(req.params.chat), path.basename(req.params.file));
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p, { dotfiles: "allow" });
});

// ---------- Library ----------
api.get("/library", (req, res) => res.json(listDocs(typeof req.query.module === "string" ? req.query.module : undefined).map(({ path: _p, ...d }) => d)));
api.post("/library", upload.array("files", 20), (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  const out = files.filter((f) => f.mimetype === "application/pdf" || f.originalname.toLowerCase().endsWith(".pdf")).map((f) => {
    const name = Buffer.from(f.originalname, "latin1").toString("utf8");
    const d = addDocument({ src: f.path, filename: name, module: String(req.body?.module ?? "allgemein"), title: files.length === 1 ? req.body?.title : undefined, kind: String(req.body?.kind ?? "buch"), move: true });
    return d.id;
  });
  files.forEach((f) => fs.rmSync(f.path, { force: true }));
  res.json({ ok: true, ids: out });
});
api.patch("/library/:id", (req, res) => {
  if (typeof req.body?.title === "string") db.prepare("UPDATE documents SET title = ? WHERE id = ?").run(req.body.title.slice(0, 200), req.params.id);
  if (isModule(req.body?.module)) db.prepare("UPDATE documents SET module = ? WHERE id = ?").run(req.body.module, req.params.id);
  if (typeof req.body?.kind === "string") db.prepare("UPDATE documents SET kind = ? WHERE id = ?").run(req.body.kind.slice(0, 20), req.params.id);
  res.json({ ok: true });
});
api.delete("/library/:id", (req, res) => res.json({ ok: deleteDoc(req.params.id) }));
api.get("/library/:id/file", (req, res) => {
  const d = getDoc(req.params.id);
  if (!d) return res.status(404).end();
  res.sendFile(d.path, { dotfiles: "allow", headers: { "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.filename)}` } });
});

// ---------- Videos ----------
api.get("/videos", (req, res) => res.json(listVideos(typeof req.query.chat === "string" ? req.query.chat : undefined)));
api.get("/videos/:id", (req, res) => { const v = getVideo(req.params.id); v ? res.json(v) : res.status(404).end(); });
api.get("/videos/:id/file", (req, res) => {
  const v = getVideo(req.params.id);
  if (!v?.path || !fs.existsSync(v.path)) return res.status(404).end();
  res.sendFile(v.path, { dotfiles: "allow", headers: req.query.download ? { "Content-Disposition": `attachment; filename="${v.title.replace(/[^\w äöüÄÖÜß-]/g, "")}.mp4"` } : {} });
});

// ---------- Static app ----------
// Paths are built from our own folders and sanitised ids, so dotfile segments (e.g. ~/.cache) are allowed.
const DIST = path.join(APP_DIR, "dist");
const site = express.Router();
site.use("/api", api);
site.use(express.static(DIST, {
  index: false, maxAge: "1h",
  setHeaders: (res, p) => {
    if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");   // content-hashed, never changes
    else if (p.endsWith("sw.js") || p.endsWith(".webmanifest")) {
      // Must never be cached (browser or CDN), otherwise app updates get stuck
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("CDN-Cache-Control", "no-store");
    }
  },
}));
site.get(/.*/, (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("CDN-Cache-Control", "no-store"); res.sendFile("index.html", { root: DIST }); });

const BASE = BASE_PATH;
if (BASE) app.use(BASE, site);
app.use(site);

importLibraryFolder();
resumeQueue();
app.listen(PORT, "127.0.0.1", () => console.log(`Study Buddy läuft auf 127.0.0.1:${PORT}${BASE ? " (Basis " + BASE + ")" : ""}`));
