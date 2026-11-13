import React from "react";
import { Tok } from "./types";
import { Theme } from "./theme";

/** Split a sentence into short chunks (max ~2 lines) so captions never cover the content. */
const chunks = (tokens: Tok[], max = 14) => {
  const out: Tok[][] = [];
  let cur: Tok[] = [];
  tokens.forEach((tok, i) => {
    cur.push(tok);
    const end = /[.!?:]$/.test(tok.t);
    const rest = tokens.length - i - 1;
    if ((end && cur.length >= 4) || (cur.length >= max && rest > 3) || rest === 0) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out;
};

export const Captions: React.FC<{ tokens: Tok[]; t: number; th: Theme }> = ({ tokens, t, th }) => {
  const cs = chunks(tokens);
  let c = cs[0];
  for (const ch of cs) if (t >= ch[0].s - 0.05) c = ch;
  const dark = th.name === "modern";
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, display: "flex", justifyContent: "center" }}>
      <div style={{
        maxWidth: 1300, padding: "12px 28px", borderRadius: 16, textAlign: "center",
        background: dark ? "rgba(2,6,23,0.85)" : "rgba(30,41,59,0.9)", fontFamily: th.body, fontSize: 34, lineHeight: 1.3,
      }}>
        {c.map((tok, i) => {
          const spoken = t >= tok.s - 0.02;
          return <span key={i} style={{ color: spoken ? "#ffffff" : "rgba(255,255,255,0.45)", fontWeight: 600 }}>{tok.t} </span>;
        })}
      </div>
    </div>
  );
};
