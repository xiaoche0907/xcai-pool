import { Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const preferenceKey = "xcaipool.theme";

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(preferenceKey);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* Use system preference when storage is unavailable. */
  }
  return "system";
}

function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

applyTheme(readTheme());

export default function ThemeControl() {
  return (
    <button
      type="button"
      className="theme-control"
      aria-label="切换深浅模式"
      title="切换深浅模式"
      onClick={() => {
        const current = getComputedStyle(document.documentElement).colorScheme;
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        try {
          localStorage.setItem(preferenceKey, next);
        } catch {
          /* The selection still applies to this page. */
        }
      }}
    >
      <Moon className="theme-moon" size={17} aria-hidden="true" />
      <Sun className="theme-sun" size={17} aria-hidden="true" />
    </button>
  );
}
