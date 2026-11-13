import React, { useMemo } from "react";
import { Theme } from "./theme";

/** Sketch as SVG (like ```svg in chat). Elements with an id appear when a part reveals them via `show`;
    elements without an id are visible from the start. This generalises the beam diagram. */
export function sanitizeSvg(src: string) {
  return src
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(image|iframe|object|embed|use)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
}

/** Map fixed highlight colours (the ones the tutor prompt uses) onto the video theme. */
function themeColors(svg: string, dark: boolean) {
  const map: Record<string, string> = dark
    ? { "#1b6e66": "#22d3ee", "#c27c0e": "#fbbf24", "#b42318": "#fb7185", "#2f5fd0": "#60a5fa", "#000": "currentColor", "#000000": "currentColor", "black": "currentColor", "#333": "currentColor", "#333333": "currentColor" }
    : { "#1b6e66": "#0f766e", "#000": "currentColor", "#000000": "currentColor", "black": "currentColor" };
  return svg.replace(/(fill|stroke|stop-color|color)=(["'])\s*(#[0-9a-fA-F]{3,6}|black)\s*\2/g, (m, a, q, c) => {
    const r = map[String(c).toLowerCase()];
    return r ? `${a}=${q}${r}${q}` : m;
  });
}

export const SketchView: React.FC<{ th: Theme; svg: string; t: number; appear: Record<string, number>; uid: string }> = ({ th, svg, t, appear, uid }) => {
  const html = useMemo(() => {
    let s = themeColors(sanitizeSvg(svg), th.name === "modern");
    // drop a fixed size so the SVG fills its area
    s = s.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "")} preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">`);
    return s;
  }, [svg, th.name]);
  // Only ids revealed via show are animated (markers, gradients etc. stay visible)
  const ids = useMemo(() => Array.from(html.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)).map((m) => m[1]).filter((id) => appear[id] !== undefined), [html, Object.keys(appear).join("|")]);
  // Per frame: visibility of each revealed element (fade in plus a slight slide)
  const css = ids.map((id) => {
    const a = appear[id];
    const p = a < -50 ? 1 : Math.max(0, Math.min(1, (t - a) / 0.6));
    const e = 1 - Math.pow(1 - p, 3);
    const sel = `.sk-${uid} [id="${id.replace(/"/g, "")}"]`;
    return `${sel}{opacity:${e.toFixed(3)};transform:translateY(${((1 - e) * 10).toFixed(1)}px);transform-box:fill-box}`;
  }).join("\n");
  return (
    <div className={`sk-${uid}`} style={{ width: "100%", height: "100%", color: th.ink, fontFamily: th.body }}>
      <style>{css}</style>
      <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};
