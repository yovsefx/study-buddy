import fs from "node:fs";
import path from "node:path";
import { query, tool, createSdkMcpServer, type SDKUserMessage, type HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { db, getSetting, now } from "./db.ts";
import { DATA_DIR, DEFAULT_LANG, MODEL, MODULES, moduleIds, moduleName } from "./config.ts";
import { addDocument, getDoc, listDocs, pageText, search } from "./library.ts";
import { checkLesson, createVideo, lessonSchema } from "./video.ts";
import { systemPrompt } from "./prompt.ts";

export type Attachment = { name: string; path: string; mime: string; size: number; pages?: number };
export type TurnEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "video"; id: string }
  | { type: "done"; messageId: number; title?: string }
  | { type: "error"; text: string };

const txt = (o: unknown) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 1) }] });

/** The tutor's tools, exposed as an in-process MCP server. Rebuilt per turn so they know the current chat. */
function buildTools(chatId: string, ctx: { videos: string[]; title?: string; emit: (e: TurnEvent) => void }) {
  return createSdkMcpServer({
    name: "study",
    version: "1.0.0",
    tools: [
      tool("search_library", "Volltextsuche in der Bibliothek (Bücher, Skripte, Altklausuren, Modulhandbuch). Liefert Treffer mit Dokument, Seite und Ausschnitt. Mit deutschen Fachbegriffen suchen.",
        { query: z.string().describe("Suchwörter, z. B. 'Substitution Integral Kettenregel'"), module: z.string().optional().describe("Modul-ID zum Eingrenzen") },
        async ({ query: q, module }) => {
          ctx.emit({ type: "status", text: "search" });
          const hits = search(q, module && moduleIds().includes(module) ? module : undefined, 8);
          return txt(hits.length ? hits.map((h) => ({ ...h, pdf: h.path })) : "Keine Treffer. Andere/kürzere Begriffe versuchen oder ohne Modul suchen.");
        }),
      tool("read_pages", "Liest den extrahierten Text von Seiten eines Bibliotheksdokuments (max. 10 Seiten pro Aufruf). Für Formeln, Abbildungen oder gescannte Seiten stattdessen die PDF mit dem Read-Tool und 'pages' öffnen.",
        { doc_id: z.string(), from: z.number().int().min(1), to: z.number().int().min(1) },
        async ({ doc_id, from, to }) => {
          const d = getDoc(doc_id);
          if (!d) return txt("Dokument nicht gefunden.");
          ctx.emit({ type: "status", text: "read" });
          const pages = pageText(doc_id, from, to);
          return txt({ title: d.title, pdf: d.path, pages_total: d.pages, pages });
        }),
      tool("list_library", "Listet die Dokumente der Bibliothek (optional nur ein Modul).",
        { module: z.string().optional() },
        async ({ module }) => txt(listDocs(module).map((d) => ({ id: d.id, title: d.title, module: d.module, kind: d.kind, pages: d.pages, status: d.status, pdf: d.path })))),
      tool("add_to_library", "Nimmt eine im Chat geschickte PDF dauerhaft in die Bibliothek auf, damit sie später durchsucht werden kann.",
        {
          upload_path: z.string().describe("Pfad des Anhangs"),
          module: z.enum(MODULES.map((m) => m.id) as [string, ...string[]]),
          title: z.string().describe("Sinnvoller Titel, z. B. 'Papula Band 1' oder 'Altklausur Mathe 1 WiSe 24/25'"),
          kind: z.enum(["buch", "skript", "altklausur", "uebung", "sonstiges"]),
        },
        async ({ upload_path, module, title, kind }) => {
          const p = path.resolve(upload_path);
          if (!p.startsWith(path.join(DATA_DIR, "uploads")) || !fs.existsSync(p) || !p.toLowerCase().endsWith(".pdf")) return txt("Nur hochgeladene PDF-Anhänge können aufgenommen werden.");
          const already = db.prepare("SELECT id, title FROM documents WHERE filename = ? AND module = ?").get(path.basename(p).replace(/^[^-]+-/, ""), module);
          if (already) return txt({ already_in_library: already });
          const d = addDocument({ src: p, filename: path.basename(p).replace(/^[^-]+-/, ""), module, title, kind });
          ctx.emit({ type: "status", text: "library" });
          return txt({ added: { id: d.id, title: d.title, module: moduleName(d.module) }, note: "Wird gerade indexiert (dauert ein paar Sekunden bis Minuten)." });
        }),
      tool("module_info", "Offizielle Modulbeschreibung aus dem Modulhandbuch (Lehrinhalte, Lernziele, Prüfungsform).",
        { module: z.enum(MODULES.map((m) => m.id) as [string, ...string[]]) },
        async ({ module }) => txt(MODULES.find((m) => m.id === module)?.handbook || "Keine Beschreibung vorhanden.")),
      tool("remember", "Speichert einen dauerhaften, kurzen Fakt über die lernende Person (Schwächen, Vorlieben, Termine).",
        { note: z.string().max(200) },
        async ({ note }) => {
          db.prepare("INSERT INTO profile(note, created) VALUES(?, ?)").run(note, now());
          return txt("Gespeichert.");
        }),
      tool("set_chat_title", "Setzt den Titel dieses Chats (max. 5 Wörter).",
        { title: z.string().max(60) },
        async ({ title }) => {
          db.prepare("UPDATE chats SET title = ? WHERE id = ?").run(title, chatId);
          ctx.title = title;
          return txt("OK");
        }),
      tool("make_video", "Erstellt ein Erklärvideo (Remotion + Stimme Conrad) aus einer Lektion. Nur aufrufen, wenn ein Video gewünscht wirde. Rendern dauert einige Minuten.",
        { lesson: lessonSchema },
        async ({ lesson }) => {
          const err = checkLesson(lesson);
          if (err) return txt("Fehler in der Lektion: " + err);
          const v = createVideo(lesson, chatId);
          ctx.videos.push(v.id);
          ctx.emit({ type: "video", id: v.id });
          return txt({ video_id: v.id, status: "wird gerendert" });
        }),
    ],
  });
}

/** Only allow the Read tool inside DATA_DIR (library copies and chat attachments). */
const guardRead: HookCallback = async (input: any) => {
  const p = String(input?.tool_input?.file_path ?? "");
  const ok = path.resolve(p).startsWith(DATA_DIR + path.sep);
  return ok ? {} : { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Nur Dateien aus der Bibliothek und den Anhängen dürfen gelesen werden." } };
};

const IMAGE_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** One chat turn: send the message to Claude, stream the answer to the client, persist everything. */
export async function runTurn(chatId: string, text: string, attachments: Attachment[], emit: (e: TurnEvent) => void) {
  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId) as any;
  const lang = getSetting("lang", DEFAULT_LANG);
  const name = getSetting("name", "");
  const profile = (db.prepare("SELECT note FROM profile ORDER BY id").all() as { note: string }[]).map((r) => r.note);
  const docs = listDocs();
  const libSummary = docs.length
    ? docs.map((d) => `- [${d.id}] ${d.title} (${moduleName(d.module)}, ${d.kind}, ${d.pages} S.${d.status !== "ready" ? ", " + d.status : ""})`).join("\n")
    : "- (noch leer)";

  // Build the user message: text plus attachments (images inline, PDFs as file paths for the Read tool)
  const blocks: any[] = [];
  for (const a of attachments) {
    if (IMAGE_MIME.includes(a.mime) && a.size < 4.5 * 1024 * 1024) {
      blocks.push({ type: "image", source: { type: "base64", media_type: a.mime, data: fs.readFileSync(a.path).toString("base64") } });
    }
  }
  const attNote = attachments.length
    ? "\n\n[Anhänge]\n" + attachments.map((a) => `- ${a.name} (${a.mime}${a.pages ? `, ${a.pages} Seiten` : ""}): ${a.path}`).join("\n")
    : "";
  blocks.push({ type: "text", text: (text || "(siehe Anhang)") + attNote });

  const userMsg: SDKUserMessage = { type: "user", message: { role: "user", content: blocks }, parent_tool_use_id: null };
  async function* prompt() { yield userMsg; }

  const ctx = { videos: [] as string[], title: undefined as string | undefined, emit };
  let answer = "";
  let sessionId: string | undefined = chat.session_id ?? undefined;
  let failed: string | null = null;

  try {
    const q = query({
      prompt: prompt(),
      options: {
        model: MODEL,
        effort: "high",
        systemPrompt: systemPrompt({ lang, module: chat.module, profile, library: libSummary, name }),
        settingSources: [],
        tools: ["Read"],
        mcpServers: { study: buildTools(chatId, ctx) },
        allowedTools: ["Read", "mcp__study__search_library", "mcp__study__read_pages", "mcp__study__list_library", "mcp__study__add_to_library", "mcp__study__module_info", "mcp__study__remember", "mcp__study__set_chat_title", "mcp__study__make_video"],
        permissionMode: "dontAsk",
        hooks: { PreToolUse: [{ matcher: "Read", hooks: [guardRead] }] },
        cwd: DATA_DIR,
        resume: sessionId,
        includePartialMessages: true,
        maxTurns: 30,
        env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "study-buddy/1.0" },
      },
    });
    let pendingGap = false;
    for await (const m of q) {
      if (m.type === "system" && (m as any).subtype === "init") sessionId = (m as any).session_id;
      else if (m.type === "stream_event") {
        const ev: any = m.event;
        if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
          const name = String(ev.content_block.name).replace("mcp__study__", "");
          emit({ type: "status", text: name === "Read" ? "read" : name });
          pendingGap = answer.length > 0;
        } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          let t = ev.delta.text as string;
          if (pendingGap) { t = "\n\n" + t; pendingGap = false; }
          answer += t;
          emit({ type: "delta", text: t });
        }
      } else if (m.type === "result") {
        sessionId = (m as any).session_id ?? sessionId;
        if ((m as any).subtype !== "success") failed = ((m as any).errors ?? []).join("; ") || (m as any).subtype;
        else if (!answer.trim() && (m as any).result) { answer = (m as any).result; emit({ type: "delta", text: answer }); }
      }
    }
  } catch (e) {
    failed = String((e as Error)?.message ?? e);
  }

  if (failed && !answer.trim()) {
    const msg = /limit|rate|usage/i.test(failed) ? "Das Claude-Nutzungslimit ist gerade erreicht. Bitte später nochmal versuchen." : "Fehler: " + failed.slice(0, 300);
    emit({ type: "error", text: msg });
    answer = "⚠️ " + msg;
  }
  const meta = { videos: ctx.videos };
  const r = db.prepare("INSERT INTO messages(chat_id, role, content, meta, created) VALUES(?, 'assistant', ?, ?, ?)").run(chatId, answer, JSON.stringify(meta), now());
  const messageId = Number(r.lastInsertRowid);
  ctx.videos.forEach((v) => db.prepare("UPDATE videos SET message_id = ? WHERE id = ?").run(messageId, v));
  db.prepare("UPDATE chats SET session_id = ?, updated = ? WHERE id = ?").run(sessionId ?? null, now(), chatId);
  emit({ type: "done", messageId, title: ctx.title });
}
