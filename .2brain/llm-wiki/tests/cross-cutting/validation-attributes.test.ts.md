---
source: tests/cross-cutting/validation-attributes.test.ts
sha256: 910cf94ae42335b7fd0158240c4c53793ee5f997e62eada070651f03351c61b8
generated_at: 2026-11-08T09:33:40.972090+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/validation-attributes.test.ts

## Purpose

Guarantees that every field a request body can carry has a human-readable label in every supported locale. It walks the generated `*Body` Zod schemas (not a hand-maintained list) so a contract change cannot outrun the i18n dictionary, then asserts each locale's `validation.attributes` covers all discovered fields.

## Key elements

- **`SHARED_QUERY_FIELDS`** — `['page', 'pageSize', 'text', 'since']`; query parameters that appear across routes but are not `*Body` properties, included in the expected-label set.
- **`SchemaNode`** — minimal structural type for a JSON-Schema node (handles `properties`, `items`, `additionalProperties`, and composition keywords).
- **`collectNames(node, into)`** — recursively walks a `SchemaNode` and adds every property name at any depth into a `Set`.
- **`bodyFields()`** — iterates all exports from `@api/schemas.zod` ending in `Body`, converts each via `z.toJSONSchema` (with `io: 'input'`, `unrepresentable: 'any'`), and returns the union of all property names.
- **`expected`** — sorted array of the union of `bodyFields()` and `SHARED_QUERY_FIELDS`; the ground-truth set of fields that must be labelled.
- **Test: "finds body fields to label…"** — asserts the set is non-vacuous (threshold is 100 when `orders` is deployed, 40 otherwise).
- **Test: `it.each(listSupportedLocales())`** — for each locale, loads `dictionary.validation.attributes` and asserts no expected field is missing.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — provides `listSupportedLocales` and `readLocaleDictionary`, the two i18n functions the test calls to enumerate locales and read each dictionary.
- **`src/infrastructure/i18n/catalog.ts`** — underlying catalog data behind the re-exports in `index.ts`; the actual source of the per-locale attribute strings.
- **`tests/support/paths.ts`** — provides `isDeployed('orders')`, used to pick the correct lower-bound threshold for the non-vacuous count assertion.
- **`tests/cross-cutting/replace-patch-parity.test.ts`** — sibling in the same cross-cutting suite; no direct import, but both guard i18n/schema consistency from different angles.

## Notes

- Path parameters are **deliberately excluded**: a bad ID returns 404 before validation, so they use the neutral fallback phrase (see `docs/tools/i18n.md#validation-messages`).
- `z.toJSONSchema` is called with `unrepresentable: 'any'` specifically so Zod date/transform types don't throw during schema extraction; without it the walk would crash on non-trivial fields.
- The test imports schemas from the generated `@api/schemas.zod` module, meaning it depends on the codegen step having run. Running this test in isolation without generated schemas will fail at import time.
