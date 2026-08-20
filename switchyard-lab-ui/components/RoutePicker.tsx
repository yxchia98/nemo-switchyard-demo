"use client";

import { ROUTES, type RouteDef } from "@/lib/routes";

/**
 * Lists the four routes declared in routes.toml. When /v1/models has been
 * fetched, any route the server did not register is flagged - a fast way to
 * catch a TOML typo during the lab.
 */
export function RoutePicker({
  value,
  onChange,
  registeredIds,
  modelsLoaded,
}: {
  value: string;
  onChange: (id: string) => void;
  registeredIds: string[];
  modelsLoaded: boolean;
}) {
  return (
    <div>
      {ROUTES.map((r: RouteDef) => {
        const missing = modelsLoaded && registeredIds.length > 0 && !registeredIds.includes(r.id);
        return (
          <button
            key={r.id}
            className="route-btn"
            data-active={value === r.id}
            style={{ ["--accent" as any]: r.accent }}
            onClick={() => onChange(r.id)}
            type="button"
          >
            <div className="rb-top">
              <span className="swatch" />
              <span className="rb-label">{r.label}</span>
            </div>
            <div className="rb-id">{r.id}</div>
            {missing && <div className="rb-missing">not listed on /v1/models</div>}
          </button>
        );
      })}
    </div>
  );
}
