---
source: src/infrastructure/adapters/semantic-log-names.generated.ts
sha256: 6a77102185d2096ed22cbd353a9a9af558b8cdda381b821a3205f4eaf41b9d0a
generated_at: 2026-10-29T01:57:14.355630+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/semantic-log-names.generated.ts

## Purpose

A generated lookup table that maps TypeScript field names (e.g. `traceId`) to the canonical attribute names used in log lines (e.g. `trace_id`). It exists as the single source of truth for how code-side property names are rendered in structured logs, and is regenerated from YAML so the mapping stays in sync without manual edits.

## Key elements

- **`semanticLogNameData`** (`as const` object) — the sole export. A 19-key mapping from camelCase code identifiers (e.g. `clientRequestId`, `actorScope`) to dotted/underscore log-line attribute names (e.g. `app.request.client_id`, `app.actor.scope`). The `as const` modifier gives each property a literal type, enabling exhaustive narrowing at call sites.

## Relationships

- **`src/infrastructure/adapters/semantic-names.ts`** — the primary consumer; imports `semanticLogNameData` to translate object properties into their log-line keys when formatting a log entry.
- **`tests/unit/infrastructure/adapters/semantic-names.test.ts`** — unit-tests the translation logic that depends on this file's mapping (e.g. asserting `traceId` → `trace_id`).

## Notes

- **Do not edit directly.** The file header marks it as output of `npm run regenerate`, sourced from `shared/rules/semantic-log-names.yaml`. Add or change a mapping by editing the YAML and re-running the generator; hand-edits will be silently overwritten on the next regeneration.
- Naming convention: values follow a dot-separated namespace scheme (`http.*`, `app.*`, bare names like `service.name`, `user_agent.original`) that mirrors the project's log schema. The mapping is intentionally 1:1 — one code field, one log attribute — with no runtime transformation logic.
