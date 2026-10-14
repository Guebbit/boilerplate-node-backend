---
source: scripts/contracts/asyncapi-breaking.ts
sha256: adca340c6683a4207d2e7ea626e3ce73026fe848c8f8a29e846bc5ce3d7aedfb
generated_at: 2026-10-14T07:08:23.829342+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-breaking.ts

## Purpose

Pure classification logic for detecting breaking changes between two AsyncAPI documents, extracted from the CLI script so unit tests can call it directly without triggering git or process-exit side effects.

## Key elements

- **`OVERRIDES`** (`OverrideObject`) — Tells `@asyncapi/diff` that edits/additions/removals to `/info/version` are *non-breaking* (it's document metadata, not a subscriber-facing shape).
- **`AcknowledgedBreak`** (interface) — A record of one intentionally accepted break: a JSON-pointer `path` plus a one-line `reason` explaining what replaces it.
- **`ACKNOWLEDGED_BREAKS`** (`readonly AcknowledgedBreak[]`) — The maintainers' current list of approved breaks; entries silence the diff for that exact pointer only.
- **`breakingChanges(before, after, acknowledged?)`** — Diffs two dereferenced AsyncAPI documents via `@asyncapi/diff`, applies `OVERRIDES`, keeps only breaking items, and filters out any whose `path` appears in the acknowledged list. Returns `DiffOutputItem[]` (empty array when nothing breaks).

## Relationships

- **`scripts/contracts/check-asyncapi-breaking.ts`** — The CLI counterpart; imports `breakingChanges` (and likely `ACKNOWLEDGED_BREAKS`) to run the gate end-to-end. This file exists so that module can be tested in isolation.
- **`tests/unit/scripts/contracts/asyncapi-breaking.test.ts`** — Unit-tests `breakingChanges` with custom `acknowledged` arrays, verifying filtering and the `OVERRIDES` behaviour without invoking git.

## Notes

- `ACKNOWLEDGED_BREAKS` entries are temporary: delete an entry once the corresponding change has landed on `origin/main`, since the gate compares against that branch anyway.
- `@asyncapi/diff` API quirk: the README documents the option as `overrides` (plural) but the library reads `override` (singular). The code uses the singular form.
- `diff().breaking()` is typed as a union of output formats; the code guards with `Array.isArray` and defaults to `[]`.
- The filter is exact-pointer match (`one.path !== path`); a break at a *different* pointer is not silenced even if it's semantically related to an acknowledged one.
