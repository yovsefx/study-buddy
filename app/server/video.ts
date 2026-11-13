import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { db, getSetting, now, uid, VIDEO_DIR } from "./db.ts";
import { PYTHON as PY, VIDEO_DIR_PROJECT as VIDEO_PROJECT } from "./config.ts";

/** Schema of a video lesson (same format as video/lessons/*.json). The tutor writes these via make_video. */
const note = z.object({ label: z.string().optional(), tex: z.string().optional(), text: z.string().optional() });
const part = z.object({
  say: z.string().min(2).max(600),
  text: z.string().max(200).optional(),
  tex: z.string().max(300).optional(),
  label: z.string().max(40).optional(),
  why: z.string().max(160).optional(),
  show: z.array(z.string().max(40)).max(12).optional(),
  note: note.optional(),
});
const num = z.number().finite();
const plotSpec = z.object({
  x: z.tuple([num, num]).optional(), y: z.tuple([num, num]).optional(),
  xLabel: z.string().max(30).optional(), yLabel: z.string().max(30).optional(),
  functions: z.array(z.object({ id: z.string().max(40).optional(), fn: z.string().max(200).optional(), x: z.string().max(200).optional(), y: z.string().max(200).optional(),
    label: z.string().max(60).optional(), range: z.tuple([num, num]).optional(), area: z.boolean().optional(), dashed: z.boolean().optional() })).max(4).optional(),
  points: z.array(z.object({ id: z.string().max(40).optional(), x: num, y: num, label: z.string().max(40).optional() })).max(8).optional(),
  lines: z.array(z.object({ id: z.string().max(40).optional(), points: z.array(z.tuple([num, num])).max(60), label: z.string().max(60).optional() })).max(3).optional(),
  vlines: z.array(z.object({ id: z.string().max(40).optional(), x: num, label: z.string().max(40).optional() })).max(4).optional(),
  hlines: z.array(z.object({ id: z.string().max(40).optional(), y: num, label: z.string().max(40).optional() })).max(4).optional(),
});
const scene = z.object({
  type: z.enum(["title", "formula", "list", "diagram", "plot", "sketch"]),
  plot: plotSpec.optional(),
  svg: z.string().max(20000).optional(),
  variant: z.enum(["basics", "steps", "tricks", "summary"]).optional(),
  heading: z.string().max(60),
  sub: z.string().max(80).optional(),
  tex: z.string().max(300).optional(),
  parts: z.array(part).min(1).max(5),
});
export const lessonSchema = z.object({
  title: z.string().max(80),
  module: z.string().max(60),
  style: z.enum(["tafel", "modern"]),
  beam: z.object({ l: z.number().positive(), a: z.number().positive(), F: z.number().positive() }).optional(),
  scenes: z.array(scene).min(2).max(16),
});
export type LessonInput = z.infer<typeof lessonSchema>;

export type Video = { id: string; chat_id: string | null; message_id: number | null; title: string; style: string; status: string; progress: number; path: string | null; error: string | null; duration: number | null; created: number };

export function checkLesson(l: LessonInput): string | null {
  for (const [i, s] of l.scenes.entries()) {
    if (s.type === "diagram" && !l.beam) return `Szene ${i + 1}: "diagram" braucht das Feld "beam" (nur Balken mit Einzelkraft möglich). Für andere Skizzen "sketch" mit "svg" nehmen.`;
    if (s.type === "plot" && !s.plot) return `Szene ${i + 1}: "plot" braucht das Feld "plot".`;
    if (s.type === "sketch") {
      if (!s.svg || !/^\s*<svg[\s>]/i.test(s.svg)) return `Szene ${i + 1}: "sketch" braucht "svg" mit genau einem <svg ...>.`;
      if (/<script|<foreignObject|\son\w+=/i.test(s.svg)) return `Szene ${i + 1}: Das SVG darf kein Skript, kein foreignObject und keine on…-Attribute enthalten.`;
    }
    // Every show key must exist in the scene's picture, otherwise nothing would appear
    const ids = s.type === "plot" ? [...(s.plot?.functions ?? []), ...(s.plot?.points ?? []), ...(s.plot?.lines ?? []), ...(s.plot?.vlines ?? []), ...(s.plot?.hlines ?? [])].map((e: any) => e.id).filter(Boolean)
      : s.type === "sketch" ? Array.from((s.svg ?? "").matchAll(/\sid\s*=\s*["']([^"']+)["']/g)).map((m) => m[1]) : null;
    if (ids) for (const p of s.parts) for (const k of p.show ?? []) if (!ids.includes(k)) return `Szene ${i + 1}: show "${k}" gibt es im Bild nicht (vorhanden: ${ids.join(", ") || "keine ids"}).`;
    if (s.type === "formula" && !s.tex) return `Szene ${i + 1}: "formula" braucht "tex".`;
    if (s.type === "list" && !s.variant) return `Szene ${i + 1}: "list" braucht "variant".`;
  }
  return null;
}

/** Videos never address the learner by name: "Hallo Alex!" → "Hallo!", "Viel Erfolg, Alex!" → "Viel Erfolg!". */
export function stripName(text: string, name: string) {
  const n = name.trim();
  if (!n) return text;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`[ \\t]*,?[ \\t]*\\b${esc}\\b`, "giu"), "").replace(/\s+([!?.,])/g, "$1").replace(/^[,;:\s]+/, "").replace(/^\p{Ll}/u, (c) => c.toUpperCase()).trim();
}

export function createVideo(lesson: LessonInput, chatId: string | null): Video {
  const id = "v" + uid();
  const name = getSetting("name", "");
  for (const sc of lesson.scenes) {
    sc.heading = stripName(sc.heading, name);
    for (const p of sc.parts) {
      p.say = stripName(p.say, name);
      if (p.text) p.text = stripName(p.text, name);
    }
  }
  const full = { id, voice: "de-DE-ConradNeural", rate: "-5%", ...lesson };
  fs.mkdirSync(path.join(VIDEO_PROJECT, "lessons/generated"), { recursive: true });
  fs.writeFileSync(path.join(VIDEO_PROJECT, "lessons/generated", id + ".json"), JSON.stringify(full, null, 1));
  db.prepare("INSERT INTO videos(id, chat_id, title, style, status, created) VALUES(?, ?, ?, ?, 'queued', ?)")
    .run(id, chatId, lesson.title, lesson.style, now());
  queue.push(id);
  void pump();
  return getVideo(id)!;
}

export const getVideo = (id: string) => db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as Video | undefined;
export const listVideos = (chatId?: string) =>
  (chatId ? db.prepare("SELECT * FROM videos WHERE chat_id = ? ORDER BY created").all(chatId) : db.prepare("SELECT * FROM videos ORDER BY created DESC").all()) as Video[];
export const attachVideoToMessage = (videoId: string, messageId: number) => db.prepare("UPDATE videos SET message_id = ? WHERE id = ?").run(messageId, videoId);

const set = (id: string, f: Partial<Video>) => {
  const keys = Object.keys(f);
  db.prepare(`UPDATE videos SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => (f as any)[k]), id);
};

/** Render one video at a time: rendering is CPU-heavy. */
const queue: string[] = [];
let busy = false;
async function pump() {
  if (busy) return;
  const id = queue.shift();
  if (!id) return;
  busy = true;
  try { await renderOne(id); } catch (e) { set(id, { status: "error", error: String(e).slice(0, 800) }); }
  busy = false;
  void pump();
}

function sh(cmd: string, args: string[], onLine?: (l: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn("nice", ["-n", "10", cmd, ...args], { cwd: VIDEO_PROJECT, env: process.env });
    let tail = "";
    const eat = (b: Buffer) => {
      const s = b.toString();
      tail = (tail + s).slice(-3000);
      s.split(/[\r\n]+/).forEach((l) => l && onLine?.(l));
    };
    p.stdout.on("data", eat);
    p.stderr.on("data", eat);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exit ${code}: ${tail}`))));
  });
}

async function renderOne(id: string) {
  const lessonFile = path.join(VIDEO_PROJECT, "lessons/generated", id + ".json");
  set(id, { status: "tts", progress: 0.02 });
  const total = (JSON.parse(fs.readFileSync(lessonFile, "utf8")).scenes as any[]).reduce((n, sc) => n + sc.parts.length, 0);
  let spoken = 0;
  await sh(PY, ["-I", "-u", "scripts/tts.py", lessonFile], (l) => {
    if (/^s\d+p\d+\s/.test(l)) { spoken++; set(id, { progress: 0.02 + 0.2 * (spoken / total) }); }
  });
  const data = JSON.parse(fs.readFileSync(path.join(VIDEO_PROJECT, "src/data", id + ".json"), "utf8"));
  const propsFile = path.join(VIDEO_PROJECT, "src/data", id + ".props.json");
  fs.writeFileSync(propsFile, JSON.stringify({ lesson: data }));
  set(id, { status: "rendering", progress: 0.22 });
  const out = path.join(VIDEO_DIR, id + ".mp4");
  let last = 0;
  await sh(path.join(VIDEO_PROJECT, "node_modules/.bin/remotion"), ["render", "src/index.ts", "Lesson", out, `--props=${propsFile}`, "--concurrency=5", "--log=info"], (l) => {
    const m = l.match(/Rendered\s+(\d+)\/(\d+)|(\d+)\/(\d+)/);
    if (!m) return;
    const a = Number(m[1] ?? m[3]), b = Number(m[2] ?? m[4]);
    if (b > 100 && a <= b) {
      const p = 0.22 + 0.77 * (a / b);
      if (p - last > 0.01) { last = p; set(id, { progress: p }); }
    }
  });
  const dur = data.scenes.reduce((s: number, sc: any) => s + 0.5 + 0.9 + sc.parts.reduce((x: number, p: any) => x + p.audio.duration + 0.45, 0), 0);
  set(id, { status: "done", progress: 1, path: out, duration: Math.round(dur) });
  // Clean up: the audio and props file are no longer needed
  fs.rmSync(path.join(VIDEO_PROJECT, "public/audio", id), { recursive: true, force: true });
  fs.rmSync(propsFile, { force: true });
}

/** After a restart, re-queue videos that were not finished. */
export function resumeQueue() {
  const rows = db.prepare("SELECT id FROM videos WHERE status IN ('queued', 'tts', 'rendering') ORDER BY created").all() as { id: string }[];
  rows.forEach((r) => queue.push(r.id));
  void pump();
}
