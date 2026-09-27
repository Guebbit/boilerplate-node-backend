---
source: tests/cross-cutting/replace-patch-parity.test.ts
sha256: 1eaa015b27add9690a6ef73022d6fdcac67a58c8de3a02975736e6552da1b4fc
generated_at: 2026-09-27T15:52:08.157511+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/replace-patch-parity.test.ts

## Purpose

Cross-cutting invariant test that enforces `Replace<Entity>Request` (PUT) and `Update<Entity>Request` (PATCH) schemas declare identical property *names* across every factory-backed resource. The shared `createUpdateController` factory only works because the two shapes differ solely in `required`, so a field added to one schema and forgotten on the other is silently lost. The test reads each module's own `openapi.yaml` fragment (not the bundled output) so a failure points to a line someone actually edits.

## Key elements

- **`REPLACE_OR_UPDATE`** — regex `/^(Replace|Update)(.+)Request$/` used to strip the verb prefix and group schemas by entity. Multipart and `Merge*` schemas are deliberately excluded.
- **`schemas()`** — walks `MODULES_ROOT`, reads every `<module>/openapi.yaml`, and returns a flat array of `{ module, name, properties: Set<string> }` for each `components.schemas` entry.
- **`pairedSchemas()`** — filters `schemas()` down to entities that have *both* a Replace and an Update schema (exactly two). A lone schema is dropped so the canary below can detect a regex or rename regression as an empty sweep.
- **Canary test** (`finds exactly the known Replace/Update pairs`) — asserts the *exact* sorted key set (8 entities). Prevents a silent naming drift from producing a false-pass with zero pairs.
- **Parity test** (`declares the same property names…`) — for every paired entity, diffs the two `Set<string>` property lists in both directions and asserts the mismatch list is empty.

## Relationships

- **`tests/support/paths.ts`** — imports `MODULES_ROOT` to locate the per-module `openapi.yaml` fragments without hard-coding relative paths.
- **`package.json`** — provides the `yaml` runtime dependency used to parse each fragment as YAML.

## Notes

- Reads fragments, not the bundle — mirrors the rationale documented in `contract-error-declarations.test.ts` (a bundle failure names a generated line nobody edits).
- The canary asserts an *exact* set, not a minimum (`≥ N`), so a renamed entity that no longer matches the regex drops the pair and the test fails.
- Adding a new resource to the factory requires appending its entity name to the expected array in the canary test.
- `pairedSchemas()` requires exactly 2 matches per entity; a third (e.g., a typo producing `ReplaceFooRequest` twice) silently drops the whole entity.
