# docs/modules/observability.md

## Purpose

Documents the observability module: the operator-facing HTTP surface (health, metrics overview, Prometheus scrape, live SSE stream, audit read) that exposes process-level measurements collected by `infrastructure/observability`. It owns routes and authentication, not data — it has no model, no repository, and no barrel.

## Key elements

- **Five routes in `routes.ts`** — `/health`, `/metrics` (overview), `/metrics` (scrape), `/events` (SSE), `/audit`. Each declares its own auth style inline.
- **Three authentication styles** — normal guard (health, overview, audit), static credential (scrape), cookie (SSE). Chosen per route; not shared or interchangeable.
- **No `index.ts`** — deliberate; a boundary lint makes it structurally impossible for sibling modules to import this one.
- **No `model.ts` / `repository.ts`** — the module owns URLs, not collections. All non-audit data is read from `infrastructure/observability`.

## Relationships

- **→ `audit-logs`** (solid arrow): the `/audit` route reads the audit-logs collection; this is the only route in the module backed by a domain collection.
- **→ `infrastructure/observability`**: the other four routes pull pre-collected process metrics from this module; observability owns no measurement logic.
- **→ `docs/api/observability.md`**: the API contract page for these five routes.
- **→ `docs/api/asyncapi-workflow.md`**: the AsyncAPI contract for the `/events` SSE stream.
- **→ `docs/tools/observability-layer.md`**: describes what `infrastructure/observability` measures and where.
- **→ `docs/tools/observability-reference.md`**: glossary of every metric exposed by the overview and scrape routes.
- **Frontend counterparts**: `admin` renders health + metrics reads; `realtime` consumes the SSE stream. One backend module, two frontend consumers.

## Notes

- The three auth styles are a **breaking-change hotspot**: swapping one for another in `routes.ts` is not safe (e.g., `EventSource` cannot send a header, a scraper has no session).
- Deleting this module removes the *dashboard*, not the measurements — metrics continue to be collected by `infrastructure/observability` but nothing serves them.
- The module is intentionally a dead-end in the import graph: no sibling can import it, and it imports only `audit-logs`.
