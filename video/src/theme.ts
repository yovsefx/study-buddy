import { loadFont as caveat } from "@remotion/google-fonts/Caveat";
import { loadFont as nunito } from "@remotion/google-fonts/Nunito";
import { loadFont as grotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as emoji } from "@remotion/google-fonts/NotoColorEmoji";

const fEmoji = emoji().fontFamily;

const fCaveat0 = caveat("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily;
const fNunito0 = nunito("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin"] }).fontFamily;
const fGrotesk0 = grotesk("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;
const fInter0 = inter("normal", { weights: ["400", "600", "700"], subsets: ["latin"] }).fontFamily;

const fCaveat = `${fCaveat0}, ${fEmoji}`;
const fNunito = `${fNunito0}, ${fEmoji}`;
const fGrotesk = `${fGrotesk0}, ${fEmoji}`;
const fInter = `${fInter0}, ${fEmoji}`;

export type Theme = {
  name: "tafel" | "modern";
  bg: string; ink: string; muted: string; card: string; cardBorder: string;
  accent: string; red: string; green: string; amber: string;
  head: string; body: string; headSize: number;
  variants: Record<string, { color: string; tint: string }>;
};

export const THEMES: Record<string, Theme> = {
  tafel: {
    name: "tafel", bg: "#fbfaf4", ink: "#1e293b", muted: "#64748b", card: "#ffffff", cardBorder: "#e2e8f0",
    accent: "#2563eb", red: "#dc2626", green: "#16a34a", amber: "#d97706",
    head: fCaveat, body: fNunito, headSize: 92,
    variants: {
      basics: { color: "#2563eb", tint: "#eff6ff" },
      steps: { color: "#0f766e", tint: "#f0fdfa" },
      tricks: { color: "#d97706", tint: "#fffbeb" },
      summary: { color: "#16a34a", tint: "#f0fdf4" },
    },
  },
  modern: {
    name: "modern", bg: "#0b1120", ink: "#e2e8f0", muted: "#94a3b8", card: "#111a2e", cardBorder: "#1e2a44",
    accent: "#22d3ee", red: "#fb7185", green: "#4ade80", amber: "#fbbf24",
    head: fGrotesk, body: fInter, headSize: 66,
    variants: {
      basics: { color: "#60a5fa", tint: "#0f1d3a" },
      steps: { color: "#22d3ee", tint: "#0b2230" },
      tricks: { color: "#fbbf24", tint: "#2a1f0b" },
      summary: { color: "#4ade80", tint: "#0c2417" },
    },
  },
};

