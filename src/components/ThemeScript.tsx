/**
 * Sets `data-theme` before the first paint.
 *
 * Without this the page renders in the default theme and then snaps to the stored
 * one — a white flash on every load for anyone using dark, which on this app is
 * most people. It has to be a blocking inline script for the same reason: any
 * React-based approach runs after paint, which is exactly too late.
 *
 * Resolution order, per v2 §4:
 *   1. an explicit choice in Settings
 *   2. otherwise the system preference on first run
 *   3. otherwise dark, which is the default
 */
export const THEME_KEY = "growline:theme";

const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
      return;
    }
    var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.setAttribute("data-theme", prefersLight ? "light" : "dark");
  } catch (e) {
    // Private mode, storage disabled, anything else: fall back to the default.
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
