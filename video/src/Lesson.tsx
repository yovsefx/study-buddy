import React from "react";
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, Lesson, timeline } from "./types";
import { THEMES, Theme } from "./theme";
import { activeIndex, DiagramScene, FormulaScene, ListScene, Notes, TitleScene } from "./Scenes";
import { Captions } from "./Captions";

const Background: React.FC<{ th: Theme }> = ({ th }) =>
  th.name === "tafel" ? (
    <AbsoluteFill style={{
      background: th.bg,
      backgroundImage: "linear-gradient(rgba(37,99,235,0.07) 2px, transparent 2px), linear-gradient(90deg, rgba(37,99,235,0.07) 2px, transparent 2px)",
      backgroundSize: "48px 48px",
    }} />
  ) : (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 85% 10%, #12305a 0%, transparent 60%), radial-gradient(900px 600px at 0% 100%, #2a1650 0%, transparent 60%), ${th.bg}` }} />
  );

const SceneView: React.FC<{ L: Lesson; i: number; starts: number[]; th: Theme; appear: Record<string, number>; dur: Record<string, number> }> = ({ L, i, starts, th, appear, dur }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / FPS;
  const sc = L.scenes[i];
  const o = interpolate(frame, [0, 10, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const k = activeIndex(t, starts);
  const part = sc.parts[k];
  const props = { L, sc, th, t, starts };
  return (
    <AbsoluteFill style={{ opacity: o }}>
      {sc.parts.map((p, j) => (
        <Sequence key={j} from={Math.round(starts[j] * FPS)} durationInFrames={Math.ceil(p.audio.duration * FPS) + 3} layout="none">
          <Html5Audio src={staticFile(p.audio.src)} />
        </Sequence>
      ))}
      {sc.type === "title" && <TitleScene {...props} />}
      {sc.type === "formula" && <FormulaScene {...props} />}
      {sc.type === "list" && <ListScene {...props} />}
      {(sc.type === "diagram" || sc.type === "plot" || sc.type === "sketch") && <DiagramScene {...props} appear={appear} dur={dur} uid={`s${i}`} />}
      {t >= starts[0] && <Captions tokens={part.audio.tokens} t={t - starts[k]} th={th} />}
    </AbsoluteFill>
  );
};

const NotesLayer: React.FC<{ th: Theme; notes: { at: number }[]; visibleFrom: number }> = ({ th, notes, visibleFrom }) => {
  const frame = useCurrentFrame();
  return <Notes th={th} t={frame / FPS} notes={notes} visibleFrom={visibleFrom} />;
};

const Progress: React.FC<{ th: Theme; total: number }> = ({ th, total }) => {
  const frame = useCurrentFrame();
  return <div style={{ position: "absolute", left: 0, bottom: 0, height: 8, width: `${(frame / total) * 100}%`, background: th.accent, opacity: 0.8 }} />;
};

export const LessonVideo: React.FC<{ lesson: Lesson }> = ({ lesson: L }) => {
  const th = THEMES[L.style];
  const { scenes, total } = timeline(L);
  // Diagram elements stay visible across scenes once shown
  const seen = new Set<string>();
  // dur: how long the part that reveals an element speaks (curves are drawn over that time)
  const durs: Record<string, number>[] = [];
  // Every key that is shown at some point: hidden until then (1e9), visible afterwards
  const allKeys = new Set(L.scenes.flatMap((sc) => sc.parts.flatMap((p) => p.show ?? [])));
  const appears = L.scenes.map((sc, i) => {
    const a: Record<string, number> = {};
    const d: Record<string, number> = {};
    allKeys.forEach((k) => (a[k] = 1e9));
    seen.forEach((k) => (a[k] = -100));
    sc.parts.forEach((p, j) => p.show?.forEach((k) => { if (a[k] === undefined || a[k] === 1e9) { a[k] = scenes[i].starts[j]; d[k] = p.audio.duration; } seen.add(k); }));
    durs.push(d);
    return a;
  });
  // Running notes (Merkzettel): each note with its global timestamp
  const notes = L.scenes.flatMap((sc, i) => sc.parts.flatMap((p, j) => (p.note ? [{ ...p.note, at: scenes[i].from / FPS + scenes[i].starts[j] }] : [])));
  const visibleFrom = notes.length ? notes[0].at : 1e9;
  return (
    <AbsoluteFill>
      <Background th={th} />
      {scenes.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.dur}>
          <SceneView L={L} i={i} starts={s.starts} th={th} appear={appears[i]} dur={durs[i]} />
        </Sequence>
      ))}
      <div style={{ position: "absolute", top: 40, right: 60, fontFamily: th.body, fontSize: 24, fontWeight: 700, color: th.muted, opacity: 0.8 }}>{L.module}</div>
      <NotesLayer th={th} notes={notes} visibleFrom={visibleFrom} />
      <Progress th={th} total={total} />
    </AbsoluteFill>
  );
};
