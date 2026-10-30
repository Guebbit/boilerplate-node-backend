---
source: scripts/contracts/asyncapi-breaking.ts
sha256: 81e77e579931783a5f55878874a6c42419030a61fa2f9710d44a1f35280bb0e0
generated_at: 2026-10-29T01:29:01.821580+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-breaking.ts

## Purpose

Extracts the pure classification logic for detecting breaking changes between two AsyncAPI documents so it can be unit-tested in isolation, without triggering the CLI's git commands or `process.exit` flow that live in `check-asyncapi-breaking.ts`.

## Key elements

- **`breakingChanges(before, after, acknowledged?)`** — Compares two dereferenced AsyncAPI documents via `@asyncapi/diff`, applies the `OVERRIDES` standard, and returns the list of breaking `DiffOutputItem`s after filtering out any whose JSON pointer appears in `acknowledged` (defaults to `ACKNOWLEDGED_BREAKS`).
- **`AcknowledgedBreak`** — Interface with `path` (JSON pointer) and `reason` (one-line justification). An entry in `ACKNOWLEDGED_BREAKS` silences the gate for that exact pointer.
- **`OVERRIDES`** (module-private) — Marks add/remove/edit on `/info/version` as non-breaking so a routine version bump does not fail its own gate.
- **`ACKNOWLEDGED_BREAKS`** (module-private) — Currently an empty readonly array; maintained by hand to whitelist accepted breaks until they land on `origin/main`.

## Relationships

- **`scripts/contracts/check-asyncapi-breaking.ts`** — The CLI entry point that imports `breakingChanges` and `AcknowledgedBreak`, feeds it documents parsed from git, and decides the exit code. This file exists so that import does not pull in `child_process`/`process.exit` side effects.
- **`tests/unit/scripts/contracts/asyncapi-breaking.test.ts`** — Unit tests that call `breakingChanges` directly with fixture objects and custom `acknowledged` arrays, verifying override behavior and filter logic without invoking the CLI.

## Notes

- `@asyncapi/diff`'s `.breaking()` return type is a union of output formats; the code guards with `Array.isArray` and casts, because the JSON-array shape is the only one consumed here.
- The `@asyncapi/diff` README says the option is `overrides` (plural), but the library actually reads `override` (singular). The code uses the singular form.
- An `AcknowledgedBreak` entry silences only the exact JSON pointer listed; sibling or nested paths are unaffected. Remove the entry once the change is on `origin/main`.
- The diff input must be *dereferenced* (`parsed.json()` form); passing a document with `$ref` pointers will produce misleading results.
