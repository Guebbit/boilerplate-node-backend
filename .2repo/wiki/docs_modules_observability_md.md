# docs/modules/observability.md

## Purpose

Documents the observability module — the operator-facing HTTP surface (health, metrics overview, live SSE stream, Prometheus scrape endpoint, audit read). This page exists so a reader can understand the module's boundary, its per-route authentication choices, and its deliberate absence of a barrel export without reading the source.

## Key elements

- **`routes.ts`** — the single implementation file. Defines all endpoints and carries three distinct authentication styles (documented inline at each choice point).
- **No `model.ts` / `repository.ts` / `index.ts`** — the module owns URLs only; all measurements are read from `infrastructure/observability`. The missing barrel is a structural lint boundary, not an oversight.
- **Frontend counterparts** — `admin` renders the health/metrics reads; `realtime` consumes the SSE stream. One backend module, two frontend consumers.
- **Audit read** — the only route that serves domain data, delegating to the `audit-logs` collection.

## Relationships

- **`docs/modules/index.md`** — parent index that lists this module among the codebase's module pages.
- **`docs/modules/users.md`** — no interaction described in this file.

## Notes

- The three auth styles in `routes.ts` are **not interchangeable**: SSE uses cookie auth (EventSource cannot set headers), the Prometheus scrape uses a static credential (no session), and the remaining routes use the standard style. Changing one does not license changing the others.
- Deleting this module removes the *serving* layer only; `infrastructure/observability` continues collecting metrics unconditionally.
- The deliberate absence of a barrel means sibling modules **cannot** import this module — the boundary is enforced by the linter, not by convention.
