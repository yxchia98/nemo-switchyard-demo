"use client";

/**
 * Dell Technologies APJ AI Innovation Hub lockup.
 *
 * IMPORTANT - trademark handling:
 * This component deliberately does NOT redraw the Dell Technologies logo. The
 * circular "DELL" mark with the slanted E is a registered trademark and brand
 * standards require the official asset files, correct clear space (the height
 * of the "D" on all sides) and a minimum digital size of 30px.
 *
 * So there are two modes:
 *   1. Default  - a typographic lockup plus an original routing glyph drawn for
 *                 this lab console. Safe to use anywhere.
 *   2. Official - drop the approved SVG from the Dell brand resource center into
 *                 public/ and set NEXT_PUBLIC_BRAND_LOGO_SRC (e.g. /dell-logo.svg).
 *                 The real mark then renders in place of the glyph, on the dark
 *                 background the white logo variant is approved for.
 */

const OFFICIAL_LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO_SRC;

/** Original mark for this console: one inbound request fanning to two tiers. */
function RoutingGlyph() {
  return (
    <svg
      className="glyph"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Routing glyph: one request fanning out to two model tiers"
    >
      <defs>
        <linearGradient id="aiih-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3AA9FF" />
          <stop offset="100%" stopColor="#0076CE" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="url(#aiih-g)" />
      <g stroke="#ffffff" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M7 16 H12" />
        <path d="M12 16 C16 16, 16 9.5, 20.5 9.5" />
        <path d="M12 16 C16 16, 16 22.5, 20.5 22.5" />
      </g>
      <g fill="#ffffff">
        <circle cx="7" cy="16" r="2.1" />
        <circle cx="22.6" cy="9.5" r="2.1" />
        <circle cx="22.6" cy="22.5" r="2.1" />
      </g>
    </svg>
  );
}

export function BrandLockup() {
  return (
    <div className="lockup">
      {OFFICIAL_LOGO ? (
        <img src={OFFICIAL_LOGO} alt="Dell Technologies" className="official-logo" />
      ) : (
        <RoutingGlyph />
      )}

      <div className="lockup-text">
        <span className="org">Dell Technologies</span>
        <span className="hub">APJ AI Innovation Hub</span>
      </div>

      <span className="lockup-rule" aria-hidden="true" />

      <div className="lockup-app">
        <span className="app-name">NeMo Switchyard Lab</span>
        <span className="app-sub">Routing observability console</span>
      </div>
    </div>
  );
}
