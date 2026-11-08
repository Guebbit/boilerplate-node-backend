---
source: tests/support/spec-ids.ts
sha256: 9ce927acf0dd63d95d016aba62a79d16523221ce1be42901992fa40834799503
generated_at: 2026-11-08T10:00:50.543164+00:00
model: ollama:qwen3.8:27b
---

# tests/support/spec-ids.ts

## Purpose

Identifies every `Id`-typed field in an operation's request (path, query, and body) by walking the resolved OpenAPI schema tree and matching the shared `Id` pattern. This lets the malformed-ids integration test exercise the one-answer-per-position rule on every route the spec declares—including routes added after this file was written—without a hand-maintained field list.

## Key elements

- **`Segment`** (type) — A single step down a body: an object key (`string`) or `0` for the first element of an array.
- **`isContractId`** — Returns `true` when a `SchemaNode`'s `pattern` equals `CONTRACT_ID_PATTERN`, i.e. the node is the contract's shared `Id` type.
- **`idFieldsOf`** — Recursively walks a resolved body/query schema (properties, `items`, `oneOf`/`anyOf` variants) and returns all `Segment[]` paths that terminate at an `Id`-typed node.
- **`idPathParameters`** — Filters an `Operation`'s path parameters to those whose schema is the contract `Id`.
- **`idQueryFields`** — Returns `Segment[][]` for every `Id`-typed field reachable through the operation's query parameters.
- **`idBodyFields`** — Returns `Segment[][]` for every `Id`-typed field in the operation's body schema.
- **`fieldName`** — Joins a `Segment[]` into the dotted name a 422 response would report (e.g. `items.0.productId`).
- **`setPath`** — Writes `value` at a `Segment[]` path on a mutable target, auto-creating intermediate `{}` or `[]` containers as needed.

## Relationships

- **`src/infrastructure/http/ids.ts`** — Supplies `CONTRACT_ID_PATTERN`, the single source of truth for what makes a schema an `Id`.
- **`tests/support/spec-walk.ts`** — Provides the `Operation` and `SchemaNode` types this file uses to navigate the resolved spec tree.
- **`tests/integration/malformed-ids.test.ts`** — Primary consumer; calls the `id*` helpers to enumerate every id position per route and asserts the one-answer rule.
- **`tests/support/spec-arbitraries.ts`** — Sibling support module in the same test suite; shares the `Segment`/field-path vocabulary for generating malformed-id payloads.

## Notes

- Array positions are always represented by the literal `0` (not an arbitrary index), matching the "first element" convention in both `idFieldsOf` and the 422 field-name format.
- `setPath` decides whether to create an intermediate `[]` vs `{}` by inspecting the *next* segment's type, so callers can pass a fresh `{}` as the root.
- Detection is purely pattern-based; adding a new `Id` field to `openapi.yaml` requires no changes here.
