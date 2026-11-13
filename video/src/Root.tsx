import React from "react";
import { AbsoluteFill, Composition } from "remotion";
import { LessonVideo } from "./Lesson";
import { FPS, Lesson, timeline } from "./types";

/** Shown in Remotion Studio when no lesson is passed in. */
const Empty: React.FC = () => (
  <AbsoluteFill style={{ background: "#fbfaf4", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif", fontSize: 40, color: "#475569" }}>
    Render with --props=&lt;file&gt; (see scripts/demo.mjs)
  </AbsoluteFill>
);

const LessonOrEmpty: React.FC<{ lesson: Lesson | null }> = ({ lesson }) => (lesson ? <LessonVideo lesson={lesson} /> : <Empty />);

/** One generic composition. The app (and scripts/demo.mjs) render it with --props={"lesson": ...},
    where the lesson already carries the audio durations written by scripts/tts.py. */
export const RemotionRoot: React.FC = () => (
  <Composition id="Lesson" component={LessonOrEmpty} fps={FPS} width={1920} height={1080}
    durationInFrames={150} defaultProps={{ lesson: null as Lesson | null }}
    calculateMetadata={({ props }) => ({ durationInFrames: props.lesson ? timeline(props.lesson).total : 150 })} />
);
