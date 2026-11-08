---
source: tests/cross-cutting/replace-patch-parity.test.ts
sha256: 2aa04049b33330c93f129689f579dd14830dc4b5e2e0bd5e653c1dae0ecc19a8
generated_at: 2026-11-08T09:31:06.173844+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/replace-patch-parity.test.ts

## Purpose

Guarantees that every `Replace<Entity>Request` and `Update<Entity>Request` schema pair declares an identical set of writable field names. The shared `createUpdateController` factory only works because the two schemas differ solely in `required`-ness; a field present on one but missing from the other is valid in isolation yet breaks the PUT/PATCH parity contract.

## Key elements

- **`SchemaShape`** (interface) — module, schema name, and a `Set<string>` of its declared `properties` keys.
- **`REPLACE_OR_UPDATE`** (regex) — matches `Replace<Entity>Request` / `Update<Entity>Request` schema names; captures the entity remainder for pairing.
- **`schemas()`** — walks every module under `MODULES_ROOT` that has an `openapi.yaml`, parses `components.schemas`, and returns a flat list of `SchemaShape`.
- **`pairedSchemas()`** — groups `schemas()` output by entity; keeps **only** entries where exactly two schemas (one Replace, one Update) are present. Lone schemas are dropped so the canary test can distinguish "no pairs found" from "one pair found."
- **Canary test** (`finds exactly the known Replace/Update pairs`) — asserts the *exact* sorted set of paired entities against a hardcoded `known` map, filtered by `isDeployed`. Catches silent pairing-regex breakage that a `>= N` assertion would miss.
- **Parity test** (`declares the same property names on both verbs`) — for every paired entity, asserts the two `properties` key-sets are identical; reports which fields exist on one side only.

## Relationships

- **`tests/support/paths.ts`** — provides `MODULES_ROOT` (directory walk target) and `isDeployed` (filters the canary's expected set to currently-deployed modules).
- **`tests/cross-cutting/validation-attributes.test.ts`** — sibling cross-cutting test; both read from per-module `openapi.yaml` fragments rather than the bundled spec, following the convention noted in `contract-error-declarations.test.ts`.

## Notes

- The `known` map in the canary test is **manual**: adding a resource to the factory requires updating it here or the test fails.
- The test reads fragments directly (not the bundle) so that a failure points at a file a developer actually edits.
- Multipart request schemas are intentionally excluded — the factory validates only the JSON-shaped schema for both content types.
- Uses `toSorted()` (non-mutating, ES 2023) rather than `sort()`.
- A lone `Replace*` or `Update*` with no counterpart is *dropped* by `pairedSchemas()` rather than surfaced; the canary test is the only guard against that silent loss.
