import React, { useMemo } from "react";
// @ts-ignore – keine Typen
import mathEval from "built-in-math-eval";
import { Theme } from "./theme";

/** Same format as ```plot in chat, plus an id per element that parts reveal via `show`. */
export type PlotSpec = {
  x?: [number, number]; y?: [number, number]; xLabel?: string; yLabel?: string;
  functions?: { id?: string; fn?: string; x?: string; y?: string; label?: string; range?: [number, number]; area?: boolean; dashed?: boolean }[];
  points?: { id?: string; x: number; y: number; label?: string }[];
  lines?: { id?: string; points: [number, number][]; label?: string }[];
  vlines?: { id?: string; x: number; label?: string }[];
  hlines?: { id?: string; y: number; label?: string }[];
};

export function normalizeExpr(e: string) {
  return e
    .replace(/\bln\s*\(/g, "log(")
    .replace(/\blg\s*\(([^()]*)\)/g, "(log($1)/log(10))")
    .replace(/(^|[^A-Za-z_])e(?![A-Za-z_(])/g, "$1E")
    .replace(/\bpi\b|π/g, "PI")
    .replace(/·|×/g, "*").replace(/−/g, "-")
    .replace(/²/g, "^2").replace(/³/g, "^3");
}

/** "Nice" axis ticks: 1, 2 or 5 times a power of ten, about 6 ticks. */
function ticks(a: number, b: number, n = 6) {
  const raw = (b - a) / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
const de = (v: number) => (Math.abs(v) < 1e-9 ? "0" : String(Math.round(v * 1000) / 1000).replace(".", ",").replace("-", "−"));

/** Sample a function into an SVG path; jumps (poles, NaN) break the path. */
function samplePath(f: (x: number) => number, x0: number, x1: number, X: (v: number) => number, Y: (v: number) => number, yspan: number, n = 500) {
  let d = "", pen = false;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    let y: number;
    try { y = f(x); } catch { y = NaN; }
    if (!Number.isFinite(y) || Math.abs(y) > yspan * 50) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${X(x).toFixed(2)},${Y(y).toFixed(2)}`;
    pen = true;
  }
  return d;
}

export const PlotView: React.FC<{
  th: Theme; spec: PlotSpec; t: number; appear: Record<string, number>; dur: Record<string, number>; uid: string; tall?: boolean;
}> = ({ th, spec, t, appear, dur, uid, tall }) => {
  const W = 1200, H = tall ? 700 : 440, ml = 86, mr = 30, mt = 44, mb = 64;
  const [x0, x1] = spec.x ?? [-5, 5];
  const [y0, y1] = spec.y ?? [-5, 5];
  const X = (v: number) => ml + ((v - x0) / (x1 - x0)) * (W - ml - mr);
  const Y = (v: number) => H - mb - ((v - y0) / (y1 - y0)) * (H - mt - mb);
  const dark = th.name === "modern";
  const colors = dark ? ["#22d3ee", "#fbbf24", "#4ade80", "#fb7185"] : ["#2563eb", "#d97706", "#16a34a", "#dc2626"];
  const grid = dark ? "rgba(226,232,240,0.10)" : "rgba(30,41,59,0.10)";
  const axis = dark ? "rgba(226,232,240,0.55)" : "rgba(30,41,59,0.55)";

  /** 0..1: how far an element is drawn (curves draw over the speaking time of their part). */
  const prog = (id: string | undefined, draw = false) => {
    if (!id || appear[id] === undefined) return id ? 0 : 1;
    const a = appear[id];
    if (a < -50) return 1;
    const len = draw ? Math.max(1.2, (dur[id] ?? 3) * 0.8) : 0.5;
    return Math.max(0, Math.min(1, (t - a) / len));
  };

  const curves = useMemo(() => (spec.functions ?? []).map((f, i) => {
    let d = "", area = "";
    try {
      if (f.x && f.y) {
        const fx = mathEval(normalizeExpr(f.x)), fy = mathEval(normalizeExpr(f.y));
        const [a, b] = f.range ?? [0, 2 * Math.PI];
        let pts = "";
        for (let k = 0; k <= 400; k++) {
          const tt = a + ((b - a) * k) / 400;
          const xv = fx.eval({ t: tt }), yv = fy.eval({ t: tt });
          if (Number.isFinite(xv) && Number.isFinite(yv)) pts += `${pts ? "L" : "M"}${X(xv).toFixed(2)},${Y(yv).toFixed(2)}`;
        }
        d = pts;
      } else if (f.fn) {
        const fn = mathEval(normalizeExpr(f.fn));
        const ev = (x: number) => fn.eval({ x });
        const [a, b] = f.range ?? [x0, x1];
        d = samplePath(ev, Math.max(a, x0), Math.min(b, x1), X, Y, y1 - y0);
        if (f.area) {
          const line = samplePath(ev, a, b, X, Y, y1 - y0, 200);
          area = `${line}L${X(b).toFixed(2)},${Y(0).toFixed(2)}L${X(a).toFixed(2)},${Y(0).toFixed(2)}Z`;
        }
      }
    } catch { d = ""; }
    return { ...f, d, area, color: "" };
  }).map((c, i, all) => {
    // An area takes the colour of its curve (same function), otherwise the next colour
    const owner = c.area ? all.findIndex((o) => !o.area && o.fn === c.fn) : -1;
    const idx = owner >= 0 ? all.slice(0, owner).filter((o) => !o.area).length : all.slice(0, i).filter((o) => !o.area).length;
    return { ...c, color: colors[idx % colors.length] };
  }), [JSON.stringify(spec), dark]);

  const xt = ticks(x0, x1), yt = ticks(y0, y1);
  const fs = 24;
  const legend = [
    ...curves.filter((c) => c.label && !c.area).map((c) => ({ id: c.id, label: c.label!, color: c.color, dashed: c.dashed })),
    ...(spec.lines ?? []).filter((l) => l.label).map((l, i) => ({ id: l.id, label: l.label!, color: colors[(curves.length + i) % colors.length], dashed: false })),
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", overflow: "visible" }}>
      <defs><clipPath id={`clip-${uid}`}><rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} /></clipPath></defs>
      {/* Grid and axes */}
      {xt.map((v) => <line key={"gx" + v} x1={X(v)} x2={X(v)} y1={mt} y2={H - mb} stroke={grid} strokeWidth={1.5} />)}
      {yt.map((v) => <line key={"gy" + v} y1={Y(v)} y2={Y(v)} x1={ml} x2={W - mr} stroke={grid} strokeWidth={1.5} />)}
      {y0 <= 0 && y1 >= 0 && <line x1={ml} x2={W - mr} y1={Y(0)} y2={Y(0)} stroke={axis} strokeWidth={2.5} />}
      {x0 <= 0 && x1 >= 0 && <line y1={mt} y2={H - mb} x1={X(0)} x2={X(0)} stroke={axis} strokeWidth={2.5} />}
      {xt.map((v) => <text key={"tx" + v} x={X(v)} y={H - mb + 32} fill={th.muted} fontSize={21} fontFamily={th.body} textAnchor="middle">{de(v)}</text>)}
      {yt.map((v) => <text key={"ty" + v} x={ml - 14} y={Y(v) + 7} fill={th.muted} fontSize={21} fontFamily={th.body} textAnchor="end">{de(v)}</text>)}
      {spec.xLabel && <text x={W - mr} y={H - mb - 12} fill={th.ink} fontSize={fs} fontFamily={th.body} fontWeight={700} textAnchor="end">{spec.xLabel}</text>}
      {spec.yLabel && <text x={X(Math.max(x0, Math.min(0, x1))) + 14} y={mt + 22} fill={th.ink} fontSize={fs} fontFamily={th.body} fontWeight={700}>{spec.yLabel}</text>}

      <g clipPath={`url(#clip-${uid})`}>
        {/* Areas under curves fade in once their curve is drawn */}
        {curves.map((c, i) => c.area && <path key={"a" + i} d={c.area} fill={c.color} opacity={0.16 * prog(c.id, true)} />)}
        {/* Hilfslinien */}
        {(spec.vlines ?? []).map((v, i) => <line key={"v" + i} x1={X(v.x)} x2={X(v.x)} y1={mt} y2={H - mb} stroke={axis} strokeWidth={2} strokeDasharray="8 8" opacity={prog(v.id)} />)}
        {(spec.hlines ?? []).map((h, i) => <line key={"h" + i} y1={Y(h.y)} y2={Y(h.y)} x1={ml} x2={W - mr} stroke={axis} strokeWidth={2} strokeDasharray="8 8" opacity={prog(h.id)} />)}
        {/* Kurven zeichnen sich synchron zur Stimme */}
        {curves.map((c, i) => {
          const p = prog(c.id, true);
          if (!c.d || p <= 0 || c.area) return null;   // areas have no outline of their own
          return (
            <path key={"c" + i} d={c.d} fill="none" stroke={c.color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray={c.dashed ? undefined : "1 1"} strokeDashoffset={c.dashed ? undefined : 1 - p}
              style={c.dashed ? { strokeDasharray: "0.02 0.012", opacity: p } : undefined} />
          );
        })}
        {/* Messreihen */}
        {(spec.lines ?? []).map((l, i) => {
          const p = prog(l.id, true);
          const color = colors[(curves.length + i) % colors.length];
          const n = Math.ceil(l.points.length * p);
          const pts = l.points.slice(0, n);
          return (
            <g key={"l" + i}>
              {pts.length > 1 && <polyline points={pts.map(([a, b]) => `${X(a)},${Y(b)}`).join(" ")} fill="none" stroke={color} strokeWidth={4} />}
              {pts.map(([a, b], k) => <circle key={k} cx={X(a)} cy={Y(b)} r={8} fill={color} />)}
            </g>
          );
        })}
      </g>
      {/* Labelled points */}
      {(spec.points ?? []).map((pt, i) => {
        const p = prog(pt.id);
        if (p <= 0) return null;
        const s = 0.6 + 0.4 * Math.min(1, p * 1.4);
        const right = X(pt.x) < W - 260;
        return (
          <g key={"p" + i} opacity={p}>
            <circle cx={X(pt.x)} cy={Y(pt.y)} r={11 * s} fill={th.ink} stroke={th.bg} strokeWidth={4} />
            {pt.label && <text x={X(pt.x) + (right ? 20 : -20)} y={Y(pt.y) - 18} fill={th.ink} fontSize={26} fontFamily={th.body} fontWeight={700} textAnchor={right ? "start" : "end"} stroke={th.bg} strokeWidth={9} strokeLinejoin="round" paintOrder="stroke">{pt.label}</text>}
          </g>
        );
      })}
      {(spec.vlines ?? []).map((v, i) => v.label && <text key={"vl" + i} x={X(v.x) + 10} y={mt + 26} fill={th.muted} fontSize={21} fontFamily={th.body} opacity={prog(v.id)}>{v.label}</text>)}
      {/* Legend top left; each entry appears with its curve */}
      <g transform={`translate(${ml + 18}, ${mt + 14})`}>
        {legend.map((l, i) => (
          <g key={"lg" + i} transform={`translate(0, ${i * 36})`} opacity={prog(l.id, true) > 0 ? Math.min(1, prog(l.id) * 2) : 0}>
            <rect x={-10} y={-4} width={Math.min(520, 60 + l.label.length * 13.5)} height={34} rx={8} fill={th.bg} opacity={0.82} />
            <line x1={0} x2={34} y1={13} y2={13} stroke={l.color} strokeWidth={5} strokeDasharray={l.dashed ? "9 7" : undefined} />
            <text x={46} y={21} fill={th.ink} fontSize={22} fontFamily={th.body} fontWeight={600}>{l.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
};
