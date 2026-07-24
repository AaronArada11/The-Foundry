import { List, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";

import { useHealth } from "../hooks/use-health";
import { BrandMark } from "./brand-mark";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const health = useHealth();

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
        <div className={`system-status system-status--${health}`} role="status">
          <span className="status-dot" />
          System {health}
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
