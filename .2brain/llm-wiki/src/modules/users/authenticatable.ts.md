---
source: src/modules/users/authenticatable.ts
sha256: 6cf47ff2b589cda312fed93f667ae926413fe066849792544ec24909b32b7483
generated_at: 2026-10-15T12:06:19.365879+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/authenticatable.ts

## Purpose

Defines the single canonical rule for "may this account authenticate?" in two equivalent forms: a MongoDB filter for query-time lookups and a boolean predicate for documents already in hand. By deriving both from the same logic, query paths and in-memory checks cannot diverge on the state of a banned or soft-deleted account.

## Key elements

- **`AUTHENTICATABLE_FILTER`** (`const`, object) — The Mongo filter clause: `{ active: { $ne: false }, deletedAt: null }`. Applied by login-adjacent lookups so that a document with no `active` field is treated as enabled, and soft-deletion is matched explicitly (missing *or* null) rather than relying on driver defaults.
- **`isAuthenticatable(user)`** (function) — Predicate twin of the filter for a user document already loaded (refresh, token mint, OAuth address match). Returns `true` when `active !== false` and `deletedAt` is falsy. Accepts a `Pick<UserDocument, 'active' | 'deletedAt'>`.

## Relationships

- **`./model`** (`src/modules/users/model.ts`) — Imports the `UserDocument` type used in the predicate's parameter signature.
- **`src/modules/users/services/lookups.ts`** — Primary consumer; the doc comment states the filter is "the clause every login-adjacent lookup filters on."
- **`src/modules/account/services/oauth.ts`** — Referenced in the predicate's doc comment as a caller path ("an OAuth match by address").
- **`src/modules/users/tests/integration/authenticatable.test.ts`** — Integration tests exercising the filter/predicate equivalence.

## Notes

- **`$ne: false` vs. `true`**: `active` is checked with `$ne: false` deliberately — a document *missing* the field is considered enabled. Switching to `{ active: true }` would lock out legacy documents that never set the field.
- **`deletedAt: null` vs. `undefined`**: The filter spells out `null` to match both a missing field and an explicit `null` value. Using `undefined` would depend on a MongoDB driver default and is intentionally avoided.
- **Equivalence contract**: The filter and the predicate are stated to "answer alike on every state." Any change to one must be mirrored in the other (and in the integration test).
