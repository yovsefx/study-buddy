import React from "react";
import { Atom, BookOpen, Calculator, Cpu, DraftingCompass, FlaskConical, Leaf, MessagesSquare, Scale, Sigma, Thermometer, Zap, type LucideIcon } from "lucide-react";

/** Module icons by name, as set in config/modules.json ("icon": "sigma"). Unknown names fall back to a book. */
const ICONS: Record<string, LucideIcon> = {
  sigma: Sigma, atom: Atom, "flask-conical": FlaskConical, scale: Scale, "drafting-compass": DraftingCompass,
  leaf: Leaf, "messages-square": MessagesSquare, calculator: Calculator, cpu: Cpu, thermometer: Thermometer, zap: Zap, "book-open": BookOpen,
};

export function ModuleIcon({ icon, size = 18 }: { icon?: string; size?: number }) {
  const I = (icon && ICONS[icon]) || BookOpen;
  return <I size={size} strokeWidth={2.2} />;
}
