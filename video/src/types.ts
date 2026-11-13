export type Tok = { t: string; s: number; e: number };
export type Audio = { src: string; duration: number; tokens: Tok[] };
export type Note = { label?: string; tex?: string; text?: string };
export type Part = { say: string; text?: string; tex?: string; label?: string; why?: string; show?: string[]; note?: Note; audio: Audio };
import type { PlotSpec } from "./Plot";
export type Scene = {
  type: "title" | "formula" | "list" | "diagram" | "plot" | "sketch";
  plot?: PlotSpec; svg?: string;
  variant?: "basics" | "steps" | "tricks" | "summary";
  heading: string; sub?: string; tex?: string; parts: Part[];
};
export type Lesson = {
  id: string; title: string; module: string; style: "tafel" | "modern"; voice: string; rate?: string;
  beam?: { l: number; a: number; F: number }; scenes: Scene[];
};

export const FPS = 30;
const LEAD = 0.5, GAP = 0.45, TAIL = 0.9;

export type SceneTime = { from: number; dur: number; starts: number[] };

/** Timeline: scenes play one after another, parts of a scene one after another. */
export const timeline = (L: Lesson) => {
  let f = 0;
  const scenes: SceneTime[] = L.scenes.map((sc) => {
    let t = LEAD;
    const starts = sc.parts.map((p) => { const s = t; t += p.audio.duration + GAP; return s; });
    const dur = Math.ceil((t + TAIL) * FPS);
    const r = { from: f, dur, starts };
    f += dur;
    return r;
  });
  return { scenes, total: f };
};
