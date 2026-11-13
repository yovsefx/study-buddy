import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export const Tex: React.FC<{ tex: string; size: number; display?: boolean; color?: string }> = ({ tex, size, display = false, color }) => {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false }), [tex, display]);
  return <span style={{ fontSize: size, color }} dangerouslySetInnerHTML={{ __html: html }} />;
};
