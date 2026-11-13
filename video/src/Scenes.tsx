import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { Lesson, Part, Scene } from "./types";
import { Theme } from "./theme";
import { Tex } from "./Tex";
import { Beam } from "./Beam";
import { PlotView } from "./Plot";
import { SketchView } from "./Sketch";

type P = { L: Lesson; sc: Scene; th: Theme; t: number; starts: number[] };

/** Main area on the left; the running notes column sits on the right. */
export const MAIN_LEFT = 90;
export const MAIN_WIDTH = 1200;

const ease = (t: number, from: number, len = 0.5) =>
  interpolate(t, [from, from + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

/** Index of the part currently being spoken. */
export const activeIndex = (t: number, starts: number[]) => {
  let k = 0;
  starts.forEach((s, i) => { if (t >= s) k = i; });
  return k;
};

const Heading: React.FC<{ th: Theme; text: string; t: number; color?: string; full?: boolean }> = ({ th, text, t, color, full }) => {
  const o = ease(t, 0, 0.5);
  const size = th.headSize * (text.length > 34 ? 0.8 : 1);
  return (
    <div style={{ position: "absolute", top: 44, left: MAIN_LEFT, width: full ? 1700 : MAIN_WIDTH, opacity: o, transform: `translateY(${(1 - o) * -20}px)` }}>
      <div style={{ fontFamily: th.head, fontSize: size, fontWeight: 700, color: color ?? th.ink, lineHeight: 1.1, whiteSpace: "nowrap" }}>{text}</div>
      <div style={{ marginTop: 8, height: 6, width: 220 * o, borderRadius: 3, background: color ?? th.accent }} />
    </div>
  );
};

/** One item: label on the left, content on the right, the small "why" note below. */
const Item: React.FC<{ th: Theme; part: Part; t: number; start: number; active: boolean; accent: string; tint: string; size: number; labelWidth?: number; check?: boolean }> =
  ({ th, part, t, start, active, accent, tint, size, labelWidth, check }) => {
    const o = ease(t, start - 0.15, 0.45);
    if (o <= 0) return null;
    const whyO = ease(t, start + 0.6, 0.5);
    return (
      <div style={{
        opacity: o, transform: `translateX(${(1 - o) * 40}px)`,
        display: "flex", alignItems: "center", gap: 24,
        padding: "14px 26px", borderRadius: 18,
        background: active ? tint : th.card, border: `3px solid ${active ? accent : th.cardBorder}`,
        boxShadow: th.name === "tafel" ? "0 4px 14px rgba(15,23,42,0.06)" : "none",
      }}>
        {check && <div style={{ fontSize: 40, color: accent, fontWeight: 800 }}>✓</div>}
        {part.label !== undefined && labelWidth !== undefined && (
          <div style={{ width: labelWidth, flexShrink: 0, fontFamily: th.body, fontWeight: 800, fontSize: 27, color: accent, lineHeight: 1.2 }}>
            {part.label}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {part.text && <div style={{ fontFamily: th.body, fontSize: size * 0.78, fontWeight: 600, color: th.ink, lineHeight: 1.3 }}>{part.text}</div>}
          {part.tex && <div style={{ color: th.ink }}><Tex tex={part.tex} size={size} /></div>}
          {part.why && (
            <div style={{ opacity: whyO, fontFamily: th.body, fontSize: 25, fontWeight: 600, color: th.muted, lineHeight: 1.3 }}>
              ↳ {part.why}
            </div>
          )}
        </div>
      </div>
    );
  };

export const TitleScene: React.FC<P> = ({ sc, th, t }) => {
  const o = ease(t, 0.1, 0.7);
  const o2 = ease(t, 0.6, 0.7);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ opacity: o2, fontFamily: th.body, fontSize: 32, fontWeight: 700, color: th.accent, padding: "10px 26px", borderRadius: 999, border: `3px solid ${th.accent}`, marginBottom: 36 }}>
        {sc.sub}
      </div>
      <div style={{ opacity: o, transform: `scale(${0.92 + 0.08 * o})`, fontFamily: th.head, fontWeight: 700, fontSize: th.headSize * 1.6, color: th.ink, maxWidth: 1500, lineHeight: 1.05 }}>
        {sc.heading}
      </div>
      <svg width={700} height={40} style={{ marginTop: 18, opacity: o2 }}>
        <path d="M10 25 Q 180 5 350 22 T 690 18" stroke={th.amber} strokeWidth={8} fill="none" strokeLinecap="round"
          strokeDasharray={760} strokeDashoffset={760 * (1 - o2)} />
      </svg>
    </AbsoluteFill>
  );
};

export const FormulaScene: React.FC<P> = ({ sc, th, t, starts }) => {
  const o = ease(t, 0.2, 0.7);
  const k = activeIndex(t, starts);
  return (
    <AbsoluteFill>
      <Heading th={th} text={sc.heading} t={t} />
      <div style={{ position: "absolute", top: 180, left: MAIN_LEFT, width: MAIN_WIDTH, display: "flex", justifyContent: "center", opacity: o, transform: `scale(${0.9 + 0.1 * o})`, color: th.ink }}>
        <Tex tex={sc.tex!} size={84} display />
      </div>
      <div style={{ position: "absolute", top: 450, left: MAIN_LEFT + 60, width: MAIN_WIDTH - 120, display: "flex", flexDirection: "column", gap: 16 }}>
        {sc.parts.map((p, i) => (p.text || p.tex) && (
          <Item key={i} th={th} part={p} t={t} start={starts[i]} active={i === k} accent={th.accent} tint={th.variants.basics.tint} size={42} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const ListScene: React.FC<P> = ({ sc, th, t, starts }) => {
  const v = th.variants[sc.variant ?? "basics"];
  const k = activeIndex(t, starts);
  const summary = sc.variant === "summary";
  return (
    <AbsoluteFill>
      <Heading th={th} text={sc.heading} t={t} color={v.color} />
      <div style={{ position: "absolute", top: 185, left: MAIN_LEFT, width: MAIN_WIDTH, display: "flex", flexDirection: "column", gap: 16 }}>
        {sc.parts.map((p, i) => (
          <Item key={i} th={th} part={p} t={t} start={starts[i]} active={i === k} accent={v.color} tint={v.tint}
            size={summary ? 46 : 40} labelWidth={p.label !== undefined ? 270 : undefined} check={summary} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Picture on top (beam, graph or sketch), steps below. The picture builds up with the voice. */
export const DiagramScene: React.FC<P & { appear: Record<string, number>; dur: Record<string, number>; uid: string }> = ({ L, sc, th, t, starts, appear, dur, uid }) => {
  const k = activeIndex(t, starts);
  const items = sc.parts.map((p, i) => ({ p, i })).filter(({ p }) => p.text || p.tex);
  const visual =
    sc.type === "plot" && sc.plot ? <PlotView th={th} spec={sc.plot} t={t} appear={appear} dur={dur} uid={uid} tall={!items.length} /> :
    sc.type === "sketch" && sc.svg ? <SketchView th={th} svg={sc.svg} t={t} appear={appear} uid={uid} /> :
    L.beam ? <Beam th={th} t={t} appear={appear} l={L.beam.l} a={L.beam.a} F={L.beam.F} /> : null;
  return (
    <AbsoluteFill>
      <Heading th={th} text={sc.heading} t={t} />
      {/* Without step boxes below, the picture takes the full height */}
      <div style={{ position: "absolute", top: sc.type === "diagram" ? 125 : 150, left: MAIN_LEFT, width: MAIN_WIDTH, height: sc.type === "diagram" ? 420 : items.length ? 400 : 700 }}>
        {visual}
      </div>
      <div style={{ position: "absolute", top: 560, left: MAIN_LEFT, width: MAIN_WIDTH, display: "grid", gridTemplateColumns: items.length > 2 ? "1fr 1fr" : "1fr", gap: 14 }}>
        {items.map(({ p, i }) => (
          <Item key={i} th={th} part={p} t={t} start={starts[i]} active={i === k} accent={th.accent} tint={th.variants.steps.tint} size={31} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Running notes on the right: persist across scenes and collect the task and intermediate results. */
export const Notes: React.FC<{ th: Theme; t: number; notes: { at: number; label?: string; tex?: string; text?: string }[]; visibleFrom: number }> = ({ th, t, notes, visibleFrom }) => {
  const o = ease(t, visibleFrom - 0.3, 0.6);
  if (o <= 0) return null;
  const shown = notes.filter((n) => t >= n.at - 0.1);
  return (
    <div style={{
      position: "absolute", top: 135, left: 1330, width: 540, bottom: 150, opacity: o,
      background: th.name === "tafel" ? "#fffdf2" : "rgba(17,26,46,0.85)", border: `3px solid ${th.name === "tafel" ? "#fde68a" : th.cardBorder}`,
      borderRadius: 22, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: th.name === "tafel" ? "0 6px 20px rgba(15,23,42,0.07)" : "none", overflow: "hidden",
    }}>
      <div style={{ fontFamily: th.body, fontWeight: 800, fontSize: 30, color: th.amber }}>📌 Merkzettel</div>
      {shown.map((n, i) => {
        const a = ease(t, n.at - 0.1, 0.5);
        const fresh = t - n.at < 2.5;
        return (
          <div key={i} style={{
            opacity: a, transform: `translateY(${(1 - a) * 16}px)`,
            padding: "6px 14px", borderRadius: 12, display: "flex", flexDirection: "column", gap: 2, whiteSpace: "nowrap",
            background: fresh ? (th.name === "tafel" ? "#fef3c7" : "#2a1f0b") : "transparent",
            borderLeft: `5px solid ${i === 0 ? th.accent : th.amber}`,
          }}>
            {n.label && <div style={{ fontFamily: th.body, fontWeight: 800, fontSize: 19, color: th.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{n.label}</div>}
            <div style={{ color: th.ink }}>
              {n.tex && <Tex tex={n.tex} size={28} />}
              {n.text && <span style={{ fontFamily: th.body, fontSize: 23, fontWeight: 600, whiteSpace: "normal", display: "block", maxWidth: 480, lineHeight: 1.25 }}>{n.text}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
