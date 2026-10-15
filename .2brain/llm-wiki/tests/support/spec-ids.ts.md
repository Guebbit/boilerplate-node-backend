---
source: tests/support/spec-ids.ts
sha256: 9ce927acf0dd63d95d016aba62a79d16523221ce1be42901992fa40834799503
generated_at: 2026-10-15T13:02:32.860486+00:00
model: ollama:qwen3.8:27b
---

# tests/support/spec-ids.ts

## Purpose

Identifies every position in a request (path params, query params, JSON body) where the API contract expects an ID value, by matching the shared `Id` schema's pattern rather than maintaining a hardcoded list. Consumed by `malformed-ids.test.ts` to enumerate every id slot on every route declared in the spec.

## Key elements

- **`Segment`** (type) — One step into a request: an object key (`string`) or the literal `0` for an array's first element.
- **`isContractId(node)`** — Returns `true` when a resolved schema node's `pattern` equals `CONTRACT_ID_PATTERN`.
- **`idFieldsOf(node, prefix)`** — Recursively walks a body/query schema (including `oneOf`/`anyOf` variants, nested objects, and `items`) and returns every path (`Segment[][]`) that terminates at a contract-id field.
- **`idPathParameters(operation)`** — Filters an operation's path parameters to those whose schema is a contract id.
- **`idQueryFields(operation)`** — Flattens query parameters and returns the segment paths to each id field within them.
- **`idBodyFields(operation)`** — Delegates to `idFieldsOf` on the operation's body schema.
- **`fieldName(segments)`** — Joins a segment path into the dotted string a 422 response reports (e.g. `items.0.productId`).
- **`setPath(target, segments, value)`** — Writes `value` at the given segment path, auto-creating intermediate `{}` or `[]` objects as needed.

## Relationships

- **`src/infrastructure/http/ids.ts`** — Provides `CONTRACT_ID_PATTERN`, the single source of truth for what marks a schema as the shared `Id` type.
- **`tests/support/spec-walk.ts`** — Supplies the `Operation` and `SchemaNode` types that this file's functions consume.
- **`tests/integration/malformed-ids.test.ts`** — The primary consumer; uses the exported enumerators to build test cases that verify the one-answer-per-position rule on every route.

## Notes

- Array positions are always represented as the literal `0`, not an arbitrary index. This means the test only exercises the first element of any array — a deliberate simplification.
- `idFieldsOf` recurses into `oneOf`/`anyOf` variants with the *same* prefix (no extra segment), treating them as alternate shapes of the same field.
- `setPath` decides whether to create an object or an array based on the *next* segment's type, so the caller must pass a well-formed `Segment[]` path.
- Detection is entirely pattern-based: adding a new id field to `openapi.yaml` requires no change to this file.
