import MarkdownIt from "markdown-it";
// @ts-ignore – keine Typen
import container from "markdown-it-container";
// @ts-ignore – keine Typen
import texmath from "markdown-it-texmath";
import katex from "katex";
import { getLang } from "./i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookOpen, CircleCheck, Lightbulb, Pin, Sparkles, TriangleAlert } from "lucide-react";

const TITLES: Record<string, Record<string, string>> = {
  basics: { de: "Das brauchst du vorher", en: "What you need first", ar: "اللي محتاجه الأول" },
  idea: { de: "Die Idee", en: "The idea", ar: "الفكرة" },
  tricks: { de: "Tricks", en: "Tricks", ar: "حيل" },
  warning: { de: "Typische Fehler", en: "Common mistakes", ar: "أخطاء شائعة" },
  summary: { de: "Zusammenfassung", en: "Summary", ar: "الخلاصة" },
  merkzettel: { de: "Merkzettel", en: "Notes", ar: "ملاحظات" },
};
const svg = (I: any) => renderToStaticMarkup(createElement(I, { size: 18, strokeWidth: 2.4 }));
const ICONS: Record<string, string> = { basics: svg(BookOpen), idea: svg(Lightbulb), tricks: svg(Sparkles), warning: svg(TriangleAlert), summary: svg(CircleCheck), merkzettel: svg(Pin) };
const KINDS = Object.keys(TITLES);

const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
md.use(texmath, { engine: katex, delimiters: "dollars", katexOptions: { throwOnError: false, strict: false, output: "html" } });
for (const kind of KINDS) {
  md.use(container, kind, {
    render(tokens: any[], idx: number) {
      const tok = tokens[idx];
      if (tok.nesting === 1) {
        const given = tok.info.trim().slice(kind.length).trim().replace(/^[\p{Extended_Pictographic}️\s]+/u, "");
        const title = md.utils.escapeHtml(given || TITLES[kind][getLang()] || TITLES[kind].de);
        return `<section class="box box-${kind}"><div class="box-title"><span class="box-icon">${ICONS[kind]}</span>${title}</div>\n`;
      }
      return "</section>\n";
    },
  });
}
// Paragraphs starting with "↳" are the "why" notes under a formula: rendered smaller and grey
md.core.ruler.push("why", (state: any) => {
  const toks = state.tokens;
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i].type === "paragraph_open" && toks[i + 1].type === "inline" && toks[i + 1].content.trimStart().startsWith("↳")) toks[i].attrJoin("class", "why");
  }
});
// Graphics: ```plot, ```mermaid and ```svg fences become placeholders that viz.ts draws once streaming ends
const VIZ: Record<string, string> = { plot: "plot", graph: "plot", chart: "plot", mermaid: "mermaid", svg: "svg" };
const WAIT: Record<string, string> = { de: "Grafik wird gezeichnet …", en: "Drawing the graphic …", ar: "جاري رسم الشكل …" };
const defFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens: any[], idx: number, opts: any, env: any, self: any) => {
  const tok = tokens[idx];
  const kind = VIZ[(tok.info || "").trim().split(/\s+/)[0].toLowerCase()];
  if (!kind) return defFence(tokens, idx, opts, env, self);
  return `<div class="viz viz-${kind}" data-kind="${kind}" data-src="${encodeURIComponent(tok.content)}"><div class="viz-wait">${WAIT[getLang()] ?? WAIT.de}</div></div>\n`;
};

// Links in neuem Tab
const defLink = md.renderer.rules.link_open || ((t: any, i: number, o: any, _e: any, s: any) => s.renderToken(t, i, o));
md.renderer.rules.link_open = (tokens: any, idx: number, opts: any, env: any, self: any) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener");
  return defLink(tokens, idx, opts, env, self);
};

/** Put display formulas and "↳" lines into paragraphs of their own so they render cleanly. */
function prepare(src: string) {
  const out: string[] = [];
  let fence = false;
  for (const line of src.split("\n")) {
    const s = line.trim();
    if (s.startsWith("```")) fence = !fence;
    const prev = out.length ? out[out.length - 1].trim() : "";
    if (!fence && s.length > 4 && s.startsWith("$$") && s.endsWith("$$")) {
      if (prev) out.push("");
      out.push(s, "");
      continue;
    }
    if (!fence && s.startsWith("↳")) {
      if (prev && !prev.startsWith("↳")) out.push("");
      out.push(line);
      continue;
    }
    if (!fence && prev.startsWith("↳") && s && !s.startsWith("↳")) out.push("");
    out.push(line);
  }
  return out.join("\n");
}

const MERK_START = /^:::[ \t]*merkzettel[^\n]*\n/m;

/** Render an answer. The :::merkzettel block (running notes) is pulled out and shown separately. */
export function render(src: string): { html: string; merk: string | null } {
  let merk: string | null = null;
  const m = MERK_START.exec(src);
  if (m) {
    const start = m.index + m[0].length;
    const close = /\n:::[ \t]*(?:\n|$)/g;
    close.lastIndex = start - 1;
    const c = close.exec(src);
    const end = c ? c.index : src.length;
    merk = md.render(prepare(src.slice(start, end)));
    src = src.slice(0, m.index) + src.slice(c ? c.index + c[0].length : src.length);
  }
  return { html: md.render(prepare(src)), merk };
}

