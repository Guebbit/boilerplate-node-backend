---
source: tests/unit/support/response-contract.test.ts
sha256: 8175f25f9ae52a0de0e352aa6bed67d2042c02fa22449e5bdda609fec719f6be
generated_at: 2026-11-08T10:44:37.897146+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/response-contract.test.ts

## Purpose

Unit tests for the two utility helpers exported by the response-contract support module: `nullPathsIn` (enumerate dot-paths where a value is `null` in an arbitrary JSON body) and `isPackedRuleOperand` (gate whether a `null` at a given path is legal for a particular API operation's ability rules).

## Key elements

- **`describe('nullPathsIn')`** — four cases verifying that the function returns an empty array for null-free bodies, a single-key path for a top-level `null`, a deep dot-path (`items.0.metadata.changes.x.to`) for nested objects/arrays, and the sentinel `'(body)'` when the input itself is `null`.
- **`describe('isPackedRuleOperand')`** — parameterised and ad-hoc cases asserting that `null` is permitted only at the `deletedAt` leaf of a packed rule (e.g. `abilities.tenant.0.2.deletedAt`) and only for session-returning operations (`refreshToken`, `login`, `loginTwoFactor`, `loginRestore`, `getAccount`, and the `abilities.platform.N.M` shape). All other paths or non-session operations return `false`.

## Relationships

- **`tests/support/response-contract.ts`** — sole source under test. The file imports `isPackedRuleOperand` and `nullPathsIn` via the `@tests/response-contract` path alias. No other modules are touched.

## Notes

- The `@tests` alias resolves to the `tests/` directory; the support module lives at `tests/support/response-contract.ts`, so the import is a sibling-level lookup, not a `src` module.
- `isPackedRuleOperand` is deliberately operation-specific: the *same* path shape (`abilities.…deletedAt`) is legal for `login` but illegal for `listAuditLogs`, even though the latter also embeds abilities. Tests exist specifically to pin that boundary.
- The `(body)` sentinel returned by `nullPathsIn(null)` is a string, not an empty array — callers must handle it distinctly from the "no nulls found" case.
