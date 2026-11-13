import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Camera, Check, Clapperboard, Copy, Download, FileText, Microscope, Paperclip, Pin, Smile, Trash2, X } from "lucide-react";
import { api, url, type Att, type Msg, type Module, type Video } from "./api";
import { t, type Key } from "./i18n";
import { render } from "./markdown";
import { hydrateViz, resetViz } from "./viz";
import { ModuleIcon } from "./icons";

/** Fotos verkleinern (Handy-Fotos sind oft 5–10 MB). */
async function shrink(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.type === "image/gif" || f.size < 900_000) return f;
  try {
    const bmp = await createImageBitmap(f);
    const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch { return f; }
}

export function Composer({ onSend, busy, autoFocus, fill, hint }: {
  onSend: (text: string, files: File[]) => Promise<void> | void; busy: boolean; autoFocus?: boolean;
  fill?: { text: string; n: number }; hint?: string;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [drag, setDrag] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const camIn = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);

  useEffect(() => { if (fill?.n) { setText(fill.text); ta.current?.focus(); } }, [fill?.n]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);

  const add = async (list: FileList | File[] | null) => {
    if (!list) return;
    const arr = await Promise.all(Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")).slice(0, 10).map(shrink));
    setFiles((f) => [...f, ...arr].slice(0, 10));
  };
  const submit = async () => {
    if (busy || sending || (!text.trim() && !files.length)) return;
    setSending(true);
    try { await onSend(text.trim(), files); setText(""); setFiles([]); }
    catch (e: any) { alert(e.message === "busy" ? t("busy") : e.message); }
    setSending(false);
  };
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const canSend = !busy && !sending && (!!text.trim() || files.length > 0);

  return (
    <div className={"composer-wrap" + (drag ? " drag" : "")}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void add(e.dataTransfer.files); }}>
      <div className="composer-card">
        {files.length > 0 && (
          <div className="att-row">
            {files.map((f, i) => (
              <div key={i} className="att-chip">
                {previews[i] ? <img src={previews[i]!} alt="" /> : <span className="att-pdf"><FileText size={16} /></span>}
                <span className="att-name">{f.name}</span>
                <button className="att-x" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={t("remove")}><X size={16} /></button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={ta} rows={1} value={text} autoFocus={autoFocus && !touch} placeholder={hint ? `${t("inModule")} ${hint} …` : t("askPlaceholder")}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => { const imgs = Array.from(e.clipboardData.files); if (imgs.length) { e.preventDefault(); void add(imgs); } }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !touch) { e.preventDefault(); void submit(); } }}
        />
        <div className="composer-tools">
          <button className="tool-btn" title={t("attach")} aria-label={t("attach")} onClick={() => fileIn.current?.click()}><Paperclip size={19} /></button>
          <button className="tool-btn" title={t("camera")} aria-label={t("camera")} onClick={() => camIn.current?.click()}><Camera size={19} /></button>
          <input ref={fileIn} type="file" multiple accept="image/*,application/pdf,.pdf" hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
          <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
          <span className="grow" />
          <button className={"send-btn" + (canSend ? " ready" : "")} disabled={!canSend} onClick={submit} aria-label={t("send")}>
            {sending ? <span className="spinner" /> : <ArrowUp size={20} strokeWidth={2.6} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoCard({ id }: { id: string }) {
  const [v, setV] = useState<Video | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const x = await api<Video>("videos/" + id);
        if (stop) return;
        setV(x);
        if (x.status !== "done" && x.status !== "error") setTimeout(tick, 4000);
      } catch { if (!stop) setTimeout(tick, 8000); }
    };
    void tick();
    return () => { stop = true; };
  }, [id]);
  if (!v) return null;
  const head = (
    <div className="video-head">
      <span className="video-ico"><Clapperboard size={18} /></span>
      <span className="video-title">{v.title}</span>
      {v.status === "done" && v.duration ? <span className="muted small">{Math.max(1, Math.round(v.duration / 60))} {t("minutes")}</span> : null}
    </div>
  );
  if (v.status === "done") {
    return (
      <div className="video-card done">
        {head}
        <video controls playsInline preload="metadata" src={url(`videos/${v.id}/file`) + "#t=3"} />
        <a className="btn small" href={url(`videos/${v.id}/file?download=1`)}><Download size={16} /> {t("download")}</a>
      </div>
    );
  }
  if (v.status === "error") return <div className="video-card error">{head}<div className="muted small">{t("videoError")}: {v.error?.slice(0, 200)}</div></div>;
  const label: Key = v.status === "queued" ? "videoQueued" : v.status === "tts" ? "videoTts" : "videoRendering";
  return (
    <div className="video-card">
      {head}
      <div className="video-status"><span>{t(label)}</span><b>{Math.round(v.progress * 100)}%</b></div>
      <div className="progress"><div style={{ width: `${Math.max(3, v.progress * 100)}%` }} /></div>
    </div>
  );
}

function Answer({ content, streaming }: { content: string; streaming?: boolean }) {
  const { html, merk } = useMemo(() => render(content), [content]);
  const box = useRef<HTMLDivElement>(null);
  // Draw graphics only when the answer is complete; redraw on a light/dark switch
  useEffect(() => {
    if (streaming) return;
    void hydrateViz(box.current, t("vizFail"));
    const redraw = () => { if (box.current) { resetViz(box.current); void hydrateViz(box.current, t("vizFail")); } };
    window.addEventListener("sb-theme", redraw);
    return () => window.removeEventListener("sb-theme", redraw);
  }, [html, merk, streaming]);
  const narrow = typeof matchMedia !== "undefined" && matchMedia("(max-width: 700px)").matches;
  return (
    <div ref={box} className={"answer" + (merk ? " has-merk" : "")}>
      {merk && (
        <aside className="merk">
          <details open={!narrow || streaming}>
            <summary><Pin size={16} /> {t("merkzettel")}</summary>
            <div className="md" dangerouslySetInnerHTML={{ __html: merk }} />
          </details>
        </aside>
      )}
      <div className={"md" + (streaming ? " streaming" : "")} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function UserMsg({ m, chatId }: { m: Msg; chatId: string }) {
  return (
    <div className="msg user">
      <div className="bubble">
        {m.attachments.length > 0 && (
          <div className="att-row in-bubble">
            {m.attachments.map((a: Att, i) =>
              a.mime.startsWith("image/") ? (
                <a key={i} href={url(`files/${chatId}/${a.file}`)} target="_blank" rel="noopener"><img className="att-img" src={url(`files/${chatId}/${a.file}`)} alt={a.name} /></a>
              ) : (
                <a key={i} className="att-chip link" href={url(`files/${chatId}/${a.file}`)} target="_blank" rel="noopener">
                  <span className="att-pdf"><FileText size={16} /></span><span className="att-name">{a.name}{a.pages ? ` · ${a.pages} ${t("pages")}` : ""}</span>
                </a>
              ),
            )}
          </div>
        )}
        {m.content && <div className="user-text">{m.content}</div>}
      </div>
    </div>
  );
}

const Avatar = () => <img className="avatar" src="./icon-192.png" alt="" />;

export function ChatView({ id, modules, onChange }: { id: string; modules: Module[]; onChange: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [module, setModule] = useState("allgemein");
  const [title, setTitle] = useState("");
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState("");
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const es = useRef<EventSource | null>(null);

  const load = async () => {
    const r = await api<{ chat: any; messages: Msg[]; videos: Video[]; running: boolean }>("chats/" + id);
    setMsgs(r.messages);
    setModule(r.chat.module);
    setTitle(r.chat.title);
    setVideos(r.videos.filter((v) => !r.messages.some((m) => m.meta?.videos?.includes(v.id))).map((v) => v.id));
    if (r.running) subscribe();
    return r;
  };

  const subscribe = () => {
    es.current?.close();
    setRunning(true); setErr("");
    const src = new EventSource(url(`chats/${id}/stream`));
    es.current = src;
    let text = "";
    src.onopen = () => { text = ""; setLive(""); };
    src.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "delta") { text += ev.text; setLive(text); setStatus(""); }
      else if (ev.type === "status") setStatus(ev.text);
      else if (ev.type === "error") setErr(ev.text);
      else if (ev.type === "done" || ev.type === "idle") {
        src.close();
        es.current = null;
        setRunning(false); setLive(""); setStatus("");
        void load().then(() => onChange());
      }
    };
  };

  useEffect(() => { void load(); return () => es.current?.close(); }, [id]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, live, status, running]);
  const onScroll = () => {
    const el = scroller.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const send = async (text: string, files: File[]) => {
    const fd = new FormData();
    fd.append("text", text);
    files.forEach((f) => fd.append("files", f));
    stick.current = true;
    setMsgs((m) => [...m, { id: -Date.now(), chat_id: id, role: "user", content: text, attachments: [], meta: {}, created: Date.now() }]);
    await api(`chats/${id}/messages`, { method: "POST", body: fd });
    const r = await api<{ messages: Msg[] }>("chats/" + id);
    setMsgs(r.messages);
    subscribe();
  };

  const changeModule = async (m: string) => {
    setModule(m);
    await api("chats/" + id, { method: "PATCH", json: { module: m } });
    onChange();
  };
  const del = async () => {
    if (!confirm(t("confirmDelete"))) return;
    await api("chats/" + id, { method: "DELETE" });
    onChange();
    location.hash = "#/";
  };

  const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
  const mod = modules.find((m) => m.id === module);
  const statusText = status && t(("st_" + status) as Key) ? t(("st_" + status) as Key) : t("thinking");

  return (
    <div className="chat">
      <div className="chat-bar">
        <label className="module-pill" style={{ "--mc": mod?.color } as React.CSSProperties}>
          <span className="module-pill-icon"><ModuleIcon icon={mod?.icon} size={15} /></span>
          <select value={module} onChange={(e) => changeModule(e.target.value)} aria-label={t("module")}>
            {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <div className="chat-bar-title">{title}</div>
        <button className="icon-btn" onClick={del} title={t("deleteChat")} aria-label={t("deleteChat")}><Trash2 size={18} /></button>
      </div>
      <div className="messages" ref={scroller} onScroll={onScroll}>
        <div className="messages-inner">
          {msgs.map((m) =>
            m.role === "user" ? <UserMsg key={m.id} m={m} chatId={id} /> : (
              <div key={m.id} className="msg assistant">
                <Avatar />
                <div className="msg-body">
                  <Answer content={m.content} />
                  {m.meta?.videos?.map((v) => <VideoCard key={v} id={v} />)}
                  <div className="actions">
                    <button className="chip" disabled={running} onClick={() => send(t("askSimpler"), [])}><Smile size={15} /> {t("simpler")}</button>
                    <button className="chip" disabled={running} onClick={() => send(t("askDeeper"), [])}><Microscope size={15} /> {t("deeper")}</button>
                    {m === lastAssistant && <button className="chip accent" disabled={running} onClick={() => send(t("askVideo"), [])}><Clapperboard size={15} /> {t("video")}</button>}
                    <button className="chip ghost" onClick={() => { void navigator.clipboard?.writeText(m.content); setCopied(m.id); setTimeout(() => setCopied(null), 1500); }}>
                      {copied === m.id ? <><Check size={15} /> {t("copied")}</> : <><Copy size={15} /> {t("copy")}</>}
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}
          {videos.map((v) => <div key={v} className="msg assistant"><Avatar /><div className="msg-body"><VideoCard id={v} /></div></div>)}
          {running && (
            <div className="msg assistant">
              <Avatar />
              <div className="msg-body">
                {live && <Answer content={live} streaming />}
                {(status || !live) && <div className="status"><span className="dots"><i /><i /><i /></span>{statusText}</div>}
              </div>
            </div>
          )}
          {err && <div className="error-box">{err}</div>}
        </div>
      </div>
      <Composer onSend={send} busy={running} hint={mod?.name} />
    </div>
  );
}
