export type ThemePref = "system" | "light" | "dark";
const KEY = "sb-theme";
const mq = window.matchMedia("(prefers-color-scheme: dark)");

export const getThemePref = (): ThemePref => (localStorage.getItem(KEY) as ThemePref) || "system";

export function applyTheme(pref: ThemePref = getThemePref()) {
  const dark = pref === "dark" || (pref === "system" && mq.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // Match the browser/status bar colour to the chosen theme (overrides both media variants)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0e0d0c" : "#ffffff"));
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(KEY, pref);
  applyTheme(pref);
  window.dispatchEvent(new Event("sb-theme"));
}

mq.addEventListener("change", () => { applyTheme(); window.dispatchEvent(new Event("sb-theme")); });
applyTheme();
