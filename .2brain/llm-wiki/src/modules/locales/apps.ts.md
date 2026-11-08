---
source: src/modules/locales/apps.ts
sha256: 87e769eb54f554dbb4e2c2f069f08f63a41a64fc6342ad137f583befc5a825f7
generated_at: 2026-11-08T06:20:00.014054+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/apps.ts

## Purpose

Defines the fixed set of "apps" (keyspaces) a deployment recognises in the locales service. Each translation entry is scoped by `(language, app, key)`, so two apps can reuse the same key for unrelated strings. App IDs are **configuration**, not database rows — the list is assembled at runtime from environment variables and exposed to the API surface (`GET /locales/apps`) and to internal services that need to validate or enumerate apps.

## Key elements

- **`backendApp()`** — Returns the API's own app ID (`NODE_LOCALE_APP_BACKEND`, default `demo-be`).
- **`frontendApp()`** — Returns the default frontend app ID (`NODE_LOCALE_APP_FRONTEND`, default `demo-fe`); used when a client omits the app parameter.
- **`extraFrontendApps()`** *(private)* — Parses `NODE_LOCALE_APPS_EXTRA` (comma-separated `id=Label` pairs) into `LocaleAppDescriptor[]` with `kind: frontend`. Label defaults to the id when omitted.
- **`listApps()`** — Returns the full, deduplicated list: backend → default frontend → extras. An ID appearing in more than one config entry keeps its first occurrence.
- **`frontendAppIds()`** — Convenience: just the `id` values of every frontend-kind app.
- **`isKnownApp(id)`** — Boolean check: does the deployment recognise this app ID?
- **`isFrontendApp(id)`** — Boolean check: is this ID a frontend app whose dictionary may be served?

## Relationships

- **`src/modules/locales/config.ts`** — Sole source of app IDs; this file calls `localesConfig()` to read the three `NODE_LOCALE_APP*` variables.
- **`src/types/index.ts`** — Provides `LocaleApp`, `LocaleAppDescriptor`, and `LocaleAppKind` used throughout this module.
- **`src/modules/locales/tests/unit/apps.test.ts`** / **`apps.fixture.ts`** — Unit tests and fixture data for this module.
- **`src/modules/locales/services/messages.ts`** — Consumes `frontendAppIds` / `isFrontendApp` to determine which keyspaces the messages route may serve (per this file's own documentation).
- **`src/modules/locales/repository.ts`** — Uses the app list for `entryCount` scoping (per this file's documentation).

## Notes

- The app list is intentionally **not** stored in the database. The file's doc-block explains that admin-writable rows would let an import typo create an orphan keyspace.
- `extraFrontendApps` is the only non-exported symbol; everything else is a public export.
- Deduplication in `listApps` uses a side-effecting `Set` inside the filter callback — the "first spelling wins" rule is load-bearing if someone later makes IDs configurable in multiple places.
- Labels for the backend and default frontend apps are hard-coded (`'API'`, `'Frontend'`), unlike extras which derive their label from the environment variable.
