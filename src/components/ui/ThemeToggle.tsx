"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

function readThemeFromDom(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setTheme(readThemeFromDom());
  }, []);

  function toggle() {
    const next: "light" | "dark" = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="lg-button-icon shrink-0"
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
    >
      {theme === "dark" ? <Sun className="size-[1.15rem]" strokeWidth={1.75} /> : <Moon className="size-[1.15rem]" strokeWidth={1.75} />}
    </button>
  );
}
