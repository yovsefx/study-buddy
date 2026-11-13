/* Graphics inside answers:
   ```plot    → function graphs, points, measurement series (function-plot, SVG)
   ```mermaid → flow, block and process diagrams
   ```svg     → sketches (free-body diagrams, beams, vectors), sanitised with DOMPurify first
   The libraries are loaded lazily, only when an answer contains a graphic. */

export type PlotSpec = {
  title?: string;
  x?: [number, number]; y?: [number, number];
  xLabel?: string; yLabel?: string;
  functions?: { fn?: string; x?: string; y?: string; r?: string; label?: string; range?: [number, number]; area?: boolean; dashed?: boolean; color?: string }[];
  points?: { x: number; y: number; label?: string; color?: string }[];
  lines?: { points: [number, number][]; label?: string; color?: string }[];
  vlines?: { x: number; label?: string }[];
  hlines?: { y: number; label?: string }[];
};

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
/** One colour per curve: calm and distinguishable in light and dark mode. */
const palette = () => (document.documentElement.dataset.theme === "dark"
  ? ["#5cc4b6", "#f2b33d", "#8fb8ff", "#f07a6e", "#c9c9c9"]
  : ["#1b6e66", "#c27c0e", "#2f5fd0", "#b42318", "#5f605c"]);

/** Translate textbook notation (ln, e, π, ²) into the plotter's expression syntax. */
export function normalizeExpr(e: string) {
  return e
    .replace(/\bln\s*\(/g, "log(")
    .replace(/\blg\s*\(([^()]*)\)/g, "(log($1)/log(10))")
    .replace(/(^|[^A-Za-z_])e(?![A-Za-z_(])/g, "$1E")
    .replace(/\bpi\b|π/g, "PI")
    .replace(/·|×/g, "*")
    .replace(/−/g, "-")
    .replace(/²/g, "^2").replace(/³/g, "^3");
}

let fpPromise: Promise<any> | null = null;
let mermaidPromise: Promise<any> | null = null;
let purifyPromise: Promise<any> | null = null;
let mermaidTheme = "";
let seq = 0;

function legend(el: HTMLElement, items: { label: string; color: string; dashed?: boolean }[]) {
  if (!items.length) return;
  const box = document.createElement("div");
  box.className = "viz-legend";
  for (const it of items) {
    const s = document.createElement("span");
    const sw = document.createElement("i");
    sw.style.borderColor = it.color;
    if (it.dashed) sw.style.borderStyle = "dashed";
    s.append(sw, document.createTextNode(it.label));
    box.append(s);
  }
  el.append(box);
}

async function renderPlot(el: HTMLElement, src: string) {
  const spec = JSON.parse(src) as PlotSpec;
  fpPromise ??= import("function-plot").then((m: any) => {
    // CommonJS/ESM interop: depending on the build the function sits on default or default.default
    for (const c of [m?.default?.default, m?.default, m?.functionPlot, m]) if (typeof c === "function") return c;
    throw new Error("function-plot nicht geladen");
  });
  const functionPlot = await fpPromise;
  const colors = palette();
  let ci = 0;
  const next = (c?: string) => c || colors[ci++ % colors.length];
  const data: any[] = [];
  const leg: { label: string; color: string; dashed?: boolean }[] = [];
  for (const f of spec.functions ?? []) {
    const color = next(f.color);
    const d: any = { color, graphType: "polyline", nSamples: 400 };
    if (f.x && f.y) { d.fnType = "parametric"; d.x = normalizeExpr(f.x); d.y = normalizeExpr(f.y); d.range = f.range ?? [0, 2 * Math.PI]; }
    else if (f.r) { d.fnType = "polar"; d.r = normalizeExpr(f.r); d.range = f.range ?? [0, 2 * Math.PI]; }
    else if (f.fn) { d.fn = normalizeExpr(f.fn); if (f.range) d.range = f.range; if (f.area) d.closed = true; }
    else continue;
    if (f.dashed) d.attr = { "stroke-dasharray": "6,5" };
    data.push(d);
    if (f.label) leg.push({ label: f.label, color, dashed: f.dashed });
  }
  for (const l of spec.lines ?? []) {
    const color = next(l.color);
    data.push({ points: l.points, fnType: "points", graphType: "polyline", color });
    data.push({ points: l.points, fnType: "points", graphType: "scatter", color });
    if (l.label) leg.push({ label: l.label, color });
  }
  for (const p of spec.points ?? []) {
    const color = p.color || css("--text", "#1f201d");
    data.push({ points: [[p.x, p.y]], fnType: "points", graphType: "scatter", color, attr: { r: 4 } });
    if (p.label) leg.push({ label: p.label, color });
  }
  const annotations = [
    ...(spec.vlines ?? []).map((v) => ({ x: v.x, text: v.label })),
    ...(spec.hlines ?? []).map((h) => ({ y: h.y, text: h.label })),
  ];

  el.innerHTML = "";
  if (spec.title) {
    const t = document.createElement("div");
    t.className = "viz-title";
    t.textContent = spec.title;
    el.append(t);
  }
  const target = document.createElement("div");
  target.className = "viz-canvas";
  el.append(target);
  const width = Math.max(260, Math.min(720, el.clientWidth || 600));
  const height = Math.round(Math.min(380, Math.max(220, width * 0.62)));
  functionPlot({
    target, width, height, grid: true, disableZoom: true,
    xAxis: { domain: spec.x ?? [-5, 5], label: spec.xLabel },
    yAxis: { domain: spec.y ?? [-5, 5], label: spec.yLabel },
    tip: { xLine: true, yLine: true },
    data, annotations,
  });
  legend(el, leg);
}

async function renderMermaid(el: HTMLElement, src: string) {
  mermaidPromise ??= import("mermaid").then((m) => m.default ?? m);
  const mermaid = await mermaidPromise;
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "neutral";
  if (mermaidTheme !== theme) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: css("--font", "system-ui"), flowchart: { htmlLabels: false, curve: "basis" } });
    mermaidTheme = theme;
  }
  const { svg } = await mermaid.render(`mmd-${Date.now()}-${seq++}`, src);
  el.innerHTML = svg;
}

async function renderSvg(el: HTMLElement, src: string) {
  purifyPromise ??= import("dompurify").then((m) => m.default ?? m);
  const DOMPurify = await purifyPromise;
  const clean = DOMPurify.sanitize(src, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ["foreignObject", "script", "style"], FORBID_ATTR: ["href", "xlink:href"] });
  if (!/^\s*<svg[\s>]/i.test(clean)) throw new Error("kein gültiges SVG");
  // In dark mode, brighten the fixed highlight colours and turn black into the text colour
  const dark = document.documentElement.dataset.theme === "dark";
  const map: Record<string, string> = dark
    ? { "#1b6e66": "#5cc4b6", "#c27c0e": "#f2b33d", "#b42318": "#f07a6e", "#2f5fd0": "#8fb8ff", "#000": "currentColor", "#000000": "currentColor", "black": "currentColor", "#333": "currentColor", "#333333": "currentColor" }
    : { "#000": "currentColor", "#000000": "currentColor", "black": "currentColor" };
  const themed = clean.replace(/(fill|stroke|stop-color|color)=(["'])\s*(#[0-9a-fA-F]{3,6}|black)\s*\2/g, (m: string, a: string, q: string, c: string) => {
    const r = map[c.toLowerCase()];
    return r ? `${a}=${q}${r}${q}` : m;
  });
  el.innerHTML = themed;
  const svg = el.querySelector("svg");
  if (svg) { svg.removeAttribute("width"); svg.removeAttribute("height"); svg.setAttribute("role", "img"); }
}

/** Draw all graphic placeholders inside a container (called once an answer is complete). */
export async function hydrateViz(root: HTMLElement | null, failText: string) {
  if (!root) return;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".viz[data-src]:not([data-done])"));
  for (const el of nodes) {
    el.dataset.done = "1";
    const kind = el.dataset.kind;
    const src = decodeURIComponent(el.dataset.src || "");
    try {
      if (kind === "plot") await renderPlot(el, src);
      else if (kind === "mermaid") await renderMermaid(el, src);
      else if (kind === "svg") await renderSvg(el, src);
    } catch (e) {
      el.innerHTML = "";
      const msg = document.createElement("div");
      msg.className = "viz-error";
      msg.textContent = failText;
      const det = document.createElement("details");
      const sum = document.createElement("summary");
      sum.textContent = String((e as Error)?.message ?? e).slice(0, 120);
      const pre = document.createElement("pre");
      pre.textContent = src;
      det.append(sum, pre);
      el.append(msg, det);
    }
  }
}

/** Mark graphics for redrawing after a light/dark switch (colours change). */
export function resetViz(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".viz[data-done]").forEach((el) => { delete el.dataset.done; });
}
