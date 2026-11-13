import React, { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { api, url, type Doc, type Module } from "./api";
import { t, type Key } from "./i18n";

const KINDS = ["buch", "skript", "altklausur", "uebung", "sonstiges"];

export function LibraryView({ modules }: { modules: Module[] }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [mod, setMod] = useState("allgemein");
  const [kind, setKind] = useState("buch");
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);

  const load = () => api<Doc[]>("library").then(setDocs);
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!docs.some((d) => d.status === "processing")) return;
    const h = setTimeout(load, 3000);
    return () => clearTimeout(h);
  }, [docs]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("module", mod);
    fd.append("kind", kind);
    Array.from(files).forEach((f) => fd.append("files", f));
    try { await api("library", { method: "POST", body: fd }); } catch (e: any) { alert(e.message); }
    setUploading(false);
    void load();
  };
  const patch = async (d: Doc, body: object) => { await api("library/" + d.id, { method: "PATCH", json: body }); void load(); };
  const del = async (d: Doc) => { if (confirm(t("confirmDelete") + "\n" + d.title)) { await api("library/" + d.id, { method: "DELETE" }); void load(); } };

  const shown = docs.filter((d) => !filter || d.module === filter);
  const modOf = (id: string) => modules.find((m) => m.id === id);

  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="page-title">{t("libTitle")}</h1>
        <p className="muted">{t("libSub")}</p>

        <div className={"upload-box" + (drag ? " drag" : "")} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}>
          <div className="upload-hint"><Upload size={22} /><span>{t("dropHere")}</span></div>
          <label>{t("module")}
            <select value={mod} onChange={(e) => setMod(e.target.value)}>
              {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label>{t("kind")}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => <option key={k} value={k}>{t(("k_" + k) as Key)}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={uploading} onClick={() => fileIn.current?.click()}>
            {uploading ? <span className="spinner" /> : <Upload size={17} />} {t("upload")}
          </button>
          <input ref={fileIn} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
        </div>

        <div className="tabs">
          <button className={"tab" + (!filter ? " active" : "")} onClick={() => setFilter("")}>{t("all")} · {docs.length}</button>
          {modules.map((m) => {
            const n = docs.filter((d) => d.module === m.id).length;
            return <button key={m.id} className={"tab" + (filter === m.id ? " active" : "")} onClick={() => setFilter(m.id)}>{m.name}{n ? ` · ${n}` : ""}</button>;
          })}
        </div>

        {shown.length === 0 && <div className="empty"><FileText size={34} /><p>{t("empty")}</p></div>}
        <div className="doc-list">
          {shown.map((d) => {
            const m = modOf(d.module);
            const scanned = JSON.parse(d.scanned || "[]") as number[];
            return (
              <div key={d.id} className="doc">
                <div className="doc-icon" style={{ "--mc": m?.color } as React.CSSProperties}><FileText size={18} /></div>
                <div className="doc-body">
                  <div className="doc-title" onClick={() => { const n = prompt(t("rename"), d.title); if (n) void patch(d, { title: n }); }}>{d.title}</div>
                  <div className="doc-meta">
                    <span className="badge">{t(("k_" + d.kind) as Key) ?? d.kind}</span>
                    {d.status === "ready" && <span>{d.pages} {t("pages")}</span>}
                    {d.status === "processing" && <span className="processing"><span className="spinner small" /> {t("processing")}</span>}
                    {d.status === "error" && <span className="error">{t("error")}</span>}
                    {scanned.length > 0 && <span className="muted scanned" title={t("scannedHint")}><ImageIcon size={13} /> {scanned.length}</span>}
                  </div>
                </div>
                <div className="doc-actions">
                  <select value={d.module} onChange={(e) => patch(d, { module: e.target.value })} aria-label={t("module")}>
                    {modules.map((mm) => <option key={mm.id} value={mm.id}>{mm.name}</option>)}
                  </select>
                  <a className="icon-btn" href={url(`library/${d.id}/file`)} target="_blank" rel="noopener" title={t("open")}><ExternalLink size={18} /></a>
                  <button className="icon-btn" onClick={() => del(d)} title={t("remove")}><Trash2 size={18} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
