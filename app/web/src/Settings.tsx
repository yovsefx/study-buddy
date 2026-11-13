import React, { useEffect, useState } from "react";
import { Brain, Check, Languages, LogOut, Monitor, Moon, Smartphone, Sun, UserRound, X } from "lucide-react";
import { api, type Note } from "./api";
import { t, type Lang } from "./i18n";
import type { ThemePref } from "./theme";

const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "de", label: "Deutsch", short: "DE" },
  { id: "en", label: "English", short: "EN" },
  { id: "ar", label: "العربية", short: "AR" },
];

export function SettingsView({ lang, onLang, theme, onTheme, name, onName, onLogout }: {
  lang: Lang; onLang: (l: Lang) => void; theme: ThemePref; onTheme: (p: ThemePref) => void;
  name: string; onName: (n: string) => Promise<void>; onLogout: () => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState(name);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(name), [name]);
  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    await onName(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };
  const load = () => api<Note[]>("profile").then(setNotes);
  useEffect(() => { void load(); }, []);
  const themes: { id: ThemePref; label: string; icon: React.ReactNode }[] = [
    { id: "system", label: t("themeSystem"), icon: <Monitor size={18} /> },
    { id: "light", label: t("themeLight"), icon: <Sun size={18} /> },
    { id: "dark", label: t("themeDark"), icon: <Moon size={18} /> },
  ];
  return (
    <div className="page">
      <div className="page-inner narrow">
        <h1 className="page-title">{t("settings")}</h1>

        <section className="card">
          <h2><UserRound size={19} /> {t("yourName")}</h2>
          <form className="name-row" onSubmit={saveName}>
            <input value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} placeholder={t("namePlaceholder")} />
            <button className="btn primary" disabled={draft.trim() === name.trim()}>{saved ? <><Check size={17} /> {t("saved")}</> : t("save")}</button>
          </form>
          <p className="muted small">{t("nameHint")}</p>
        </section>

        <section className="card">
          <h2><Languages size={19} /> {t("language")}</h2>
          <div className="seg">
            {LANGS.map((l) => (
              <button key={l.id} className={"seg-btn" + (lang === l.id ? " active" : "")} onClick={() => onLang(l.id)}>
                <span className="seg-short">{l.short}</span>{l.label}
              </button>
            ))}
          </div>
          <p className="muted small">{t("languageHint")}</p>
        </section>

        <section className="card">
          <h2><Sun size={19} /> {t("appearance")}</h2>
          <div className="seg">
            {themes.map((x) => (
              <button key={x.id} className={"seg-btn" + (theme === x.id ? " active" : "")} onClick={() => onTheme(x.id)}>{x.icon}{x.label}</button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2><Brain size={19} /> {t("memory")}</h2>
          {notes.length === 0 && <p className="muted">{t("memoryEmpty")}</p>}
          <ul className="notes">
            {notes.map((n) => (
              <li key={n.id}>
                <span>{n.note}</span>
                <button className="icon-btn" onClick={async () => { await api("profile/" + n.id, { method: "DELETE" }); void load(); }} aria-label={t("remove")}><X size={16} /></button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <p className="muted small install"><Smartphone size={18} /> {t("install")}</p>
          <button className="btn" onClick={onLogout}><LogOut size={17} /> {t("logout")}</button>
        </section>
      </div>
    </div>
  );
}
