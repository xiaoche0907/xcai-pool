import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

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
  const [theme, setTheme] = useState(readTheme);
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <label className="theme-control">
      <Icon size={15} aria-hidden="true" />
      <select
        aria-label="界面外观"
        value={theme}
        onChange={(event) => {
          const next = event.target.value as Theme;
          applyTheme(next);
          setTheme(next);
          try {
            localStorage.setItem(preferenceKey, next);
          } catch {
            /* The selection still applies to this page. */
          }
        }}
      >
        <option value="system">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </select>
    </label>
  );
}
