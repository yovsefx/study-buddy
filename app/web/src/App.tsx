import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Library, Menu, Moon, Plus, Search, Settings, Sun } from "lucide-react";
import { api, AuthError, type Chat, type Module } from "./api";
import { getLang, setLang, t, type Key, type Lang } from "./i18n";
import { ChatView, Composer } from "./Chat";
import { LibraryView } from "./Library";
import { SettingsView } from "./Settings";
import { ModuleIcon } from "./icons";
import { applyTheme, getThemePref, setThemePref, type ThemePref } from "./theme";

type Route = { page: "home" } | { page: "chat"; id: string } | { page: "library" } | { page: "settings" };
const parseHash = (): Route => {
  const h = location.hash.replace(/^#\/?/, "").split("/");
  if (h[0] === "chat" && h[1]) return { page: "chat", id: h[1] };
  if (h[0] === "library") return { page: "library" };
  if (h[0] === "settings") return { page: "settings" };
  return { page: "home" };
};
export const go = (r: string) => { location.hash = "#/" + r; };

function Login({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api("login", { method: "POST", json: { password: pw } }); onOk(); }
    catch (e: any) { setErr(e.message === "Falsches Passwort" ? t("wrongPw") : e.message); }
    setBusy(false);
  };
  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <img src="./icon-192.png" alt="" className="login-logo" />
        <h1 className="brand">Study Buddy</h1>
        <p className="muted">{t("loginSub")}</p>
        <input type="password" autoFocus placeholder={t("password")} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy || !pw}>{busy ? <span className="spinner" /> : t("login")}</button>
      </form>
    </div>
  );
}

/** Group chats by date: today, yesterday, this week, older. */
function groupChats(chats: Chat[]) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const today = d0.getTime(), yesterday = today - 864e5, week = today - 6 * 864e5;
  const groups: { key: Key; items: Chat[] }[] = [
    { key: "today", items: [] }, { key: "yesterday", items: [] }, { key: "thisWeek", items: [] }, { key: "older", items: [] },
  ];
  for (const c of chats) groups[c.updated >= today ? 0 : c.updated >= yesterday ? 1 : c.updated >= week ? 2 : 3].items.push(c);
  return groups.filter((g) => g.items.length);
}

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [offline, setOffline] = useState(false);
  const [route, setRoute] = useState<Route>(parseHash());
  const [modules, setModules] = useState<Module[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [name, setName] = useState("");
  const [, force] = useState(0);

  const loadChats = useCallback(() => api<Chat[]>("chats").then(setChats).catch(() => {}), []);
  const loadModules = useCallback(() => api<Module[]>("modules").then(setModules).catch(() => {}), []);
  const boot = useCallback(async () => {
    try {
      const me = await api<{ lang: Lang; name: string }>("me");
      setLang(me.lang);
      setName(me.name ?? "");
      setOffline(false);
      setAuthed(true);
      void loadModules();
      void loadChats();
    } catch (e) {
      if (e instanceof AuthError) { setAuthed(false); setOffline(false); }
      else { setOffline(true); setTimeout(boot, 5000); }
    }
  }, [loadChats, loadModules]);

  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => {
    const f = () => { setRoute(parseHash()); setDrawer(false); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => { if (route.page === "home" || route.page === "library") void loadModules(); }, [route.page, loadModules]);

  const changeLang = async (l: Lang) => {
    await api("settings", { method: "PUT", json: { lang: l } });
    setLang(l);
    force((x) => x + 1);
  };
  const changeName = async (n: string) => {
    const r = await api<{ name: string }>("settings", { method: "PUT", json: { name: n } });
    setName(r.name);
  };
  const changeTheme = (p: ThemePref) => { setThemePref(p); setTheme(p); };
  const isDark = document.documentElement.dataset.theme === "dark";

  const groups = useMemo(() => groupChats(chats.filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()))), [chats, q]);

  if (authed === null && offline) return (
    <div className="splash offline">
      <img src="./icon-192.png" alt="" />
      <p className="offline-title">{t("offlineTitle")}</p>
      <p className="muted small">{t("offlineHint")}</p>
      <button className="btn" onClick={() => void boot()}>{t("retry")}</button>
    </div>
  );
  if (authed === null) return <div className="splash"><img src="./icon-192.png" alt="" /></div>;
  if (!authed) return <Login onOk={boot} />;

  const modOf = (id: string) => modules.find((m) => m.id === id);
  const activeChat = route.page === "chat" ? route.id : null;
  const title = route.page === "chat" ? chats.find((c) => c.id === route.id)?.title ?? "" : route.page === "library" ? t("library") : route.page === "settings" ? t("settings") : "Study Buddy";

  return (
    <div className="layout" key={getLang()}>
      <aside className={"sidebar" + (drawer ? " open" : "")}>
        <div className="side-head">
          <img src="./icon-192.png" alt="" className="side-logo" />
          <span className="brand">Study Buddy</span>
          <span className="grow" />
            <button className="icon-btn theme-toggle" onClick={() => changeTheme(isDark ? "light" : "dark")} aria-label={t("theme")} title={t("theme")}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
        </div>
        <button className="btn primary block new-chat" onClick={() => { go(""); setDrawer(false); }}><Plus size={18} strokeWidth={2.6} /> {t("newChat")}</button>
        {chats.length > 4 && (
          <label className="side-search">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchChats")} />
          </label>
        )}
        <nav className="chat-list">
          {groups.map((g) => (
            <div key={g.key} className="chat-group">
              <div className="side-label">{t(g.key)}</div>
              {g.items.map((c) => {
                const m = modOf(c.module);
                return (
                  <a key={c.id} href={`#/chat/${c.id}`} className={"chat-item" + (c.id === activeChat ? " active" : "")}>
                    <span className="chat-dot" style={{ "--mc": m?.color } as React.CSSProperties}><ModuleIcon icon={m?.icon} size={14} /></span>
                    <span className="chat-title">{c.title}</span>
                  </a>
                );
              })}
            </div>
          ))}
          {chats.length === 0 && <p className="side-empty">{t("noChats")}</p>}
        </nav>
        <div className="side-foot">
          <a href="#/library" className={"side-link" + (route.page === "library" ? " active" : "")}><Library size={18} /> {t("library")}</a>
          <a href="#/settings" className={"side-link" + (route.page === "settings" ? " active" : "")}><Settings size={18} /> {t("settings")}</a>
        </div>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <main className="main">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setDrawer(true)} aria-label={t("menu")}><Menu size={22} /></button>
          <div className="topbar-title">{title}</div>
          <button className="icon-btn" onClick={() => go("")} aria-label={t("newChat")}><Plus size={22} /></button>
        </header>
        {route.page === "home" && <Home name={name} modules={modules} chats={chats} onCreated={(id) => { void loadChats(); go("chat/" + id); }} />}
        {route.page === "chat" && <ChatView key={route.id} id={route.id} modules={modules} onChange={loadChats} />}
        {route.page === "library" && <LibraryView modules={modules} />}
        {route.page === "settings" && (
          <SettingsView lang={getLang()} onLang={changeLang} theme={theme} onTheme={changeTheme} name={name} onName={changeName}
            onLogout={async () => { await api("logout", { method: "POST" }); setAuthed(false); }} />
        )}
      </main>
    </div>
  );
}

const greetKey = (): Key => { const h = new Date().getHours(); return h < 11 ? "goodMorning" : h < 18 ? "goodDay" : "goodEvening"; };
const fill = (tpl: string, v: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

function relDate(ts: number) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  if (ts >= d0.getTime()) return new Date(ts).toLocaleTimeString(getLang(), { hour: "2-digit", minute: "2-digit" });
  if (ts >= d0.getTime() - 864e5) return t("yesterday");
  return new Date(ts).toLocaleDateString(getLang(), { day: "numeric", month: "short" });
}

/** Home: greeting with a real figure from the data, pick a subject, ask right away. */
function Home({ name, modules, chats, onCreated }: { name: string; modules: Module[]; chats: Chat[]; onCreated: (id: string) => void }) {
  const [mod, setMod] = useState("allgemein");
  const [fillText, setFillText] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const send = async (text: string, files: File[]) => {
    const chat = await api<Chat>("chats", { method: "POST", json: { module: mod } });
    const fd = new FormData();
    fd.append("text", text);
    files.forEach((f) => fd.append("files", f));
    await api(`chats/${chat.id}/messages`, { method: "POST", body: fd });
    onCreated(chat.id);
  };
  // Example questions, attached to the first configured subjects (the last one is general)
  const subjects = modules.filter((m) => m.id !== "allgemein");
  const ideas: { text: Key; mod: string }[] = (["idea1", "idea2", "idea3", "idea4"] as Key[]).map((text, i) => ({ text, mod: i < 3 ? subjects[i]?.id ?? "allgemein" : "allgemein" }));
  const current = modules.find((m) => m.id === mod);
  const docs = modules.reduce((n, m) => n + m.docs, 0);
  const week = chats.filter((c) => c.updated > Date.now() - 7 * 864e5).length;
  const fact = fill(t(week ? "factWeek" : "factStart"), { chats: week, docs });
  const color = (id: string) => modules.find((m) => m.id === id)?.color;
  return (
    <div className="home">
      <div className="home-inner">
        <h1 className="hello">{t(greetKey())}{name ? `, ${name}` : ""}.</h1>
        <p className="hello-fact">{fact}</p>

        <div className="ask">
          <div className="subject-row" role="radiogroup" aria-label={t("chooseModule")}>
            {modules.map((m) => (
              <button key={m.id} role="radio" aria-checked={mod === m.id} className={"subject" + (mod === m.id ? " active" : "")}
                style={{ "--mc": m.color } as React.CSSProperties} onClick={() => setMod(m.id)}>{m.name}</button>
            ))}
          </div>
          <Composer onSend={send} busy={false} autoFocus fill={fillText} hint={current ? current.name : undefined} />
        </div>

        <div className="home-grid">
          <section className="panel span-8">
            <h2 className="panel-title">{t("continueChat")}</h2>
            {chats.length === 0 ? <p className="panel-empty">{t("noChats")}</p> : (
              <ul className="rows">
                {chats.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <a className="row" href={`#/chat/${c.id}`}>
                      <span className="dot" style={{ "--mc": color(c.module) } as React.CSSProperties} />
                      <span className="row-main">{c.title}</span>
                      <span className="row-meta">{relDate(c.updated)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel span-4">
            <h2 className="panel-title">{t("library")} <a href="#/library">{t("open")}</a></h2>
            <ul className="rows">
              {modules.filter((m) => m.docs > 0).map((m) => (
                <li key={m.id}>
                  <a className="row" href="#/library">
                    <span className="dot" style={{ "--mc": m.color } as React.CSSProperties} />
                    <span className="row-main">{m.name}</span>
                    <span className="row-count">{m.docs}</span>
                  </a>
                </li>
              ))}
            </ul>
            {docs === 0 && <p className="panel-empty">{t("empty")}</p>}
          </section>
          <section className="panel span-12">
            <h2 className="panel-title">{t("tryThis")}</h2>
            <ul className="rows">
              {ideas.map((i) => (
                <li key={i.text}>
                  <button className="row" onClick={() => { setMod(i.mod); setFillText({ text: t(i.text), n: Date.now() }); window.scrollTo?.(0, 0); }}>
                    <span className="dot" style={{ "--mc": color(i.mod) } as React.CSSProperties} />
                    <span className="row-main">{t(i.text)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export { applyTheme };
