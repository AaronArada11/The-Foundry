import { Desktop, List, Moon, Sun, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { useHealth } from "../hooks/use-health";
import { BrandMark } from "./brand-mark";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"system" | "light" | "dark">(() => {
    const stored = localStorage.getItem("aaron-toolkit:theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  });
  const health = useHealth();

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      localStorage.setItem("aaron-toolkit:theme", theme);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const ThemeIcon = theme === "system" ? Desktop : theme === "light" ? Sun : Moon;

  return (
    <header className="site-header">
      <div className="header-main">
        <Link className="brand" to="/" onClick={() => setMenuOpen(false)}>
          <BrandMark />
          <span>Aaron Toolkit</span>
        </Link>
        <nav
          id="mobile-navigation"
          className={menuOpen ? "site-nav site-nav--open" : "site-nav"}
          aria-label="Primary navigation"
        >
          <NavLink to="/" onClick={() => setMenuOpen(false)}>
            01. Tools
          </NavLink>
          <NavLink to="/about" onClick={() => setMenuOpen(false)}>
            02. About
          </NavLink>
        </nav>
        <div className="header-utilities">
          <div className={`system-status system-status--${health}`} role="status">
            <span className="status-dot" />
            System {health}
          </div>
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Theme: ${theme}. Switch to ${nextTheme}.`}
            title={`Theme: ${theme}`}
            onClick={() => setTheme(nextTheme)}
          >
            <ThemeIcon size={20} aria-hidden="true" />
          </button>
        </div>
        <button
          className="menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} /> : <List size={22} />}
          Menu
        </button>
      </div>
      <div
        className={`mobile-status mobile-status--${health}`}
        aria-hidden="true"
      >
        <span className="status-dot" />
        System {health}
      </div>
    </header>
  );
}
