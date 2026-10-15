---
source: tests/cross-cutting/validation-attributes.test.ts
sha256: 4627f98a49c9b4347e56b7fa53f083a92eefb64cfcae84583c089289ecaf1273
generated_at: 2026-10-15T12:41:48.501165+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/validation-attributes.test.ts

## Purpose

Guarantees that the i18n validation-attribute dictionary contains a label for **every** field a request body can carry (and no more). It walks the generated `*Body` Zod schemas rather than a hand-kept list, so adding or removing a field in a contract cannot silently drift the dictionary—missing labels fall back to a generic phrase, orphan labels become dead copy.

## Key elements

- **`SHARED_QUERY_FIELDS`** – `['page', 'pageSize', 'text', 'since']`; query params shared across routes that are not `*Body` properties but still require labels.
- **`SchemaNode`** – local interface describing the shape emitted by `z.toJSONSchema` (properties, items, additionalProperties, anyOf/oneOf/allOf).
- **`collectNames(node, into)`** – recursively walks a `SchemaNode` and accumulates every property name into a `Set`, handling nested objects, arrays, and combinators.
- **`bodyFields()`** – iterates all `*Body` exports from `@api/schemas.zod`, converts each to JSON Schema (`io: 'input'`, `unrepresentable: 'any'`), and returns the union of all field names.
- **`expected`** – sorted union of `bodyFields()` and `SHARED_QUERY_FIELDS`; the canonical list of labels required.
- **`describe('validation attribute labels')`** – two tests:
  1. Asserts `expected.length` exceeds a floor (100 if `orders` domain is deployed, else 40) so the suite cannot pass vacuously.
  2. Per-locale (via `it.each(listSupportedLocales())`): asserts the sorted keys of `dictionary.validation.attributes` exactly equal `expected`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** (re-exported as `@infrastructure/i18n`) – provides `listSupportedLocales` and `readLocaleDictionary`, the two functions this test calls to enumerate locales and load each dictionary.
- **`src/infrastructure/i18n/catalog.ts`** – implementation module behind those two i18n functions; this test depends on its public surface.
- **`tests/support/paths.ts`** – supplies `isDeployed('orders')`, used to pick the lower-bound threshold in the non-vacuous check.
- **`tests/cross-cutting/replace-patch-parity.test.ts`** – sibling cross-cutting test in the same directory; shares the same "walk generated schemas, not hand-maintained lists" philosophy but has no import-level dependency on this file.

## Notes

- **Path parameters are intentionally excluded.** A bad id returns 404 before validation runs, so they rely on the neutral fallback phrase rather than a per-field label. Rationale is documented in `docs/tools/i18n.md#validation-messages`.
- **`z.toJSONSchema` options matter.** `io: 'input'` targets the request shape (not output), and `unrepresentable: 'any'` prevents date/transform fields from throwing during conversion.
- **The non-vacuous threshold is conditional.** `isDeployed('orders')` distinguishes a full multi-domain deployment (≥ 100 fields) from a minimal one (≥ 40), avoiding false failures in partial environments.
- **SHARED_QUERY_FIELDS are a manual addition.** They are not discoverable from `*Body` schemas, so the list here must be kept in sync if new shared query params are introduced.
