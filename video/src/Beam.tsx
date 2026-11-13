import React from "react";
import { Theme } from "./theme";

/** Beam on two supports. `appear[key]` = time (s) from which an element is visible. */
export const Beam: React.FC<{
  th: Theme; t: number; appear: Record<string, number>;
  l: number; a: number; F: number;
}> = ({ th, t, appear, l, a, F }) => {
  const x0 = 120, x1 = 840, y = 230, h = 26;
  const s = (x1 - x0) / l;
  const de = (v: number) => (Math.round(v * 100) / 100).toString().replace(".", ",");
  const Bv = (F * a) / l, Av = F - Bv;
  const xF = x0 + a * s;
  const p = (k: string, speed = 2.5) => (appear[k] === undefined ? 0 : Math.max(0, Math.min(1, (t - appear[k]) * speed)));
  const fkb = p("fkb");
  const supportsOpacity = p("supports") * (1 - 0.85 * fkb);
  const ink = th.ink, acc = th.accent, red = th.red, amber = th.amber, green = th.green;

  const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; c: string; prog: number; w?: number }> = ({ x1: ax, y1: ay, x2: bx, y2: by, c, prog, w = 7 }) => {
    if (prog <= 0) return null;
    const ex = ax + (bx - ax) * prog, ey = ay + (by - ay) * prog;
    const ang = Math.atan2(ey - ay, ex - ax);
    const hl = 26, hw = 13;
    const pts = [
      [ex, ey],
      [ex - hl * Math.cos(ang) + hw * Math.sin(ang), ey - hl * Math.sin(ang) - hw * Math.cos(ang)],
      [ex - hl * Math.cos(ang) - hw * Math.sin(ang), ey - hl * Math.sin(ang) + hw * Math.cos(ang)],
    ].map((q) => q.join(",")).join(" ");
    return (
      <g>
        <line x1={ax} y1={ay} x2={ex - (hl - 4) * Math.cos(ang)} y2={ey - (hl - 4) * Math.sin(ang)} stroke={c} strokeWidth={w} strokeLinecap="round" />
        <polygon points={pts} fill={c} />
      </g>
    );
  };

  const Label: React.FC<{ x: number; y: number; main: string; sub?: string; rest?: string; c: string; o: number; size?: number; anchor?: "start" | "middle" | "end" }> = ({ x, y: ly, main, sub, rest, c, o, size = 34, anchor = "middle" }) => (
    <text x={x} y={ly} fill={c} opacity={o} fontSize={size} fontFamily={th.body} fontWeight={700} textAnchor={anchor}>
      {main}
      {sub && <tspan fontSize={size * 0.65} dy={size * 0.25}>{sub}</tspan>}
      {rest && <tspan dy={sub ? -size * 0.25 : 0}>{rest}</tspan>}
    </text>
  );

  const Dim: React.FC<{ xa: number; xb: number; yy: number; label: string; o: number; c?: string }> = ({ xa, xb, yy, label, o, c = th.muted }) => (
    <g opacity={o} stroke={c} strokeWidth={c === th.muted ? 2.5 : 5}>
      <line x1={xa} y1={yy} x2={xb} y2={yy} />
      <line x1={xa} y1={yy - 12} x2={xa} y2={yy + 12} />
      <line x1={xb} y1={yy - 12} x2={xb} y2={yy + 12} />
      <text x={(xa + xb) / 2} y={yy - 12} fill={c} stroke="none" fontSize={c === th.muted ? 28 : 32} fontFamily={th.body} fontWeight={600} textAnchor="middle">{label}</text>
    </g>
  );

  const pivot = p("moment", 1.5);
  const pulse = pivot > 0 ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
  const vA = p("valA"), vB = p("valB"), vAx = p("valAx");
  const lF = p("leverF"), lB = p("leverB");

  return (
    <svg viewBox="0 0 960 520" style={{ width: "100%", height: "100%" }}>
      {/* Lager */}
      <g opacity={supportsOpacity} stroke={ink} strokeWidth={4} fill="none">
        <polygon points={`${x0},${y + h} ${x0 - 38},${y + h + 62} ${x0 + 38},${y + h + 62}`} fill={th.card} />
        <line x1={x0 - 60} y1={y + h + 62} x2={x0 + 60} y2={y + h + 62} />
        {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={x0 - 55 + i * 22} y1={y + h + 62} x2={x0 - 70 + i * 22} y2={y + h + 80} strokeWidth={2.5} />)}
        <polygon points={`${x1},${y + h} ${x1 - 38},${y + h + 56} ${x1 + 38},${y + h + 56}`} fill={th.card} />
        <line x1={x1 - 60} y1={y + h + 62} x2={x1 + 60} y2={y + h + 62} />
        <line x1={x1 - 60} y1={y + h + 74} x2={x1 + 60} y2={y + h + 74} />
        {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={x1 - 55 + i * 22} y1={y + h + 74} x2={x1 - 70 + i * 22} y2={y + h + 92} strokeWidth={2.5} />)}
      </g>
      <Label x={x0} y={y + h + 128} main="A" c={ink} o={supportsOpacity} />
      <Label x={x1} y={y + h + 128} main="B" c={ink} o={supportsOpacity} />

      {/* Balken */}
      <rect x={x0 - 10} y={y} width={(x1 - x0 + 20) * p("beam")} height={h} rx={5} fill={th.name === "modern" ? "#334155" : "#cbd5e1"} stroke={ink} strokeWidth={3} />

      {/* Dimensions */}
      <Dim xa={x0} xb={xF} yy={y + h + 175} label={lF ? `Hebelarm ${de(a)} m` : `a = ${de(a)} m`} o={p("dims")} c={lF ? red : th.muted} />
      <Dim xa={xF} xb={x1} yy={y + h + 175} label={`${de(l - a)} m`} o={p("dims")} />
      <Dim xa={x0} xb={x1} yy={y + h + 240} label={lB ? `Hebelarm von B: ${de(l)} m` : `l = ${de(l)} m`} o={p("dims")} c={lB ? green : th.muted} />
      {lF > 0 && <text x={xF + 22} y={150} opacity={lF} fill={red} fontSize={34} fontFamily={th.body} fontWeight={800}>↻ minus</text>}
      {lB > 0 && <text x={x1 + 26} y={y + h + 66} opacity={lB} fill={green} fontSize={34} fontFamily={th.body} fontWeight={800}>↺ plus</text>}

      {/* Kraft F */}
      <Arrow x1={xF} y1={60} x2={xF} y2={y - 4} c={red} prog={p("F", 2)} />
      <Label x={xF + 22} y={92} main={`F = ${de(F)} kN`} c={red} o={p("F")} anchor="start" />

      {/* Free-body diagram: support reactions */}
      <Arrow x1={x0} y1={y + h + 120} x2={x0} y2={y + h + 4} c={vA ? green : acc} prog={fkb} />
      <Arrow x1={x0 - 130} y1={y + h / 2} x2={x0 - 14} y2={y + h / 2} c={acc} prog={fkb} />
      <Arrow x1={x1} y1={y + h + 120} x2={x1} y2={y + h + 4} c={vB ? green : acc} prog={fkb} />
      <Label x={x0 + 20} y={y + h + 110} main="A" sub="y" rest={vA ? ` = ${de(Av)} kN` : ""} c={vA ? green : acc} o={fkb} anchor="start" />
      <Label x={x0 - 80} y={y + h + 46} main="A" sub="x" rest={vAx ? " = 0" : ""} c={vAx ? green : acc} o={fkb} />
      <Label x={x1 - 20} y={y + h + 110} main="B" rest={vB ? ` = ${de(Bv)} kN` : ""} c={vB ? green : acc} o={fkb} anchor="end" />

      {/* Drehpunkt A + Drehsinn */}
      {pivot > 0 && (
        <g opacity={pivot}>
          <circle cx={x0} cy={y + h / 2} r={22 + 8 * pulse} fill="none" stroke={amber} strokeWidth={5} />
          <circle cx={x0} cy={y + h / 2} r={7} fill={amber} />
          <path d={`M ${x0 + 70} ${y - 50} A 85 85 0 0 0 ${x0 - 60} ${y - 55}`} fill="none" stroke={amber} strokeWidth={5} />
          <polygon points={`${x0 - 60},${y - 55} ${x0 - 40},${y - 75} ${x0 - 38},${y - 46}`} fill={amber} transform={`rotate(-20 ${x0 - 60} ${y - 55})`} />
          <text x={x0 + 4} y={y - 120} fill={amber} fontSize={34} fontFamily={th.body} fontWeight={800} textAnchor="middle">+ ↺</text>
        </g>
      )}
    </svg>
  );
};
