---
source: tests/cross-cutting/replace-patch-parity.test.ts
sha256: 8e98f5f1abdf72909cded9c508ff748e88bf6e9ab6f7a4212ef96881f8d6bc53
generated_at: 2026-10-15T12:40:17.431878+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/replace-patch-parity.test.ts

## Purpose

Guarantees that for every factory-backed resource, the `Replace<Entity>Request` (PUT) and `Update<Entity>Request` (PATCH) schemas declare the **same set of writable property names**. A field added to one schema and forgotten on the other is invisible in either schema alone, so this cross-cutting test sweeps all per-module OpenAPI fragments and flags the drift.

## Key elements

- **`SchemaShape`** (interface) — captures a single `components.schemas` entry: owning module, schema name, and the set of top-level `properties` keys.
- **`REPLACE_OR_UPDATE`** (regex) — `/^(Replace|Update)(.+)Request$/`; identifies the two verb prefixes the `createUpdateController` factory uses and extracts the shared entity name.
- **`schemas()`** — walks `MODULES_ROOT`, reads each module's `openapi.yaml`, and returns every declared schema as a `SchemaShape`.
- **`pairedSchemas()`** — groups `schemas()` by entity name; keeps only entities where **both** a `Replace*` and an `Update*` schema exist (lone schemas are dropped so they can't mask an empty sweep).
- **Test: "finds exactly the known Replace/Update pairs"** — canary assertion that the paired set matches a hard-coded list (filtered by `isDeployed`), using `toEqual` on sorted keys so any naming drift or regex break fails immediately.
- **Test: "declares the same property names on both verbs"** — for every pair, diffs the two `properties` Sets and asserts no field appears on one side only; reports a human-readable string naming both schemas and the missing fields.

## Relationships

- **`tests/support/paths.ts`** — provides `MODULES_ROOT` (directory to scan for `openapi.yaml` fragments) and `isDeployed` (filters the canary's expected entity list to currently-deployed modules).
- **`package.json`** — test runner configuration (Vitest); the file uses `describe`/`it`/`expect` from the configured framework.
- **`tests/cross-cutting/validation-attributes.test.ts`** — sibling cross-cutting test; both share the convention of reading per-module fragments rather than the bundled OpenAPI spec (so a failure points at a line a developer actually edits).

## Notes

- Reads from **per-module `openapi.yaml` fragments**, not the generated bundle. A bundle failure names a line nobody edits; a fragment failure points at the source file.
- **Multipart** schemas are excluded (the factory validates the JSON-shaped schema for both content types, so a multipart-only variant is not in scope).
- **`Merge*`** schemas (e.g., locales bulk-entry replace) are deliberately out of scope — they follow a separate convention, not the `createUpdateController` factory.
- The canary test asserts **exact equality** of the entity set, not a minimum count. A silent rename that breaks the pairing regex would drop a pair, and `>= N` would still pass.
- The known-pairs list must be updated when a new resource moves onto the factory; `isDeployed` filtering means removing a module naturally shrinks the expected set without editing the list.
