---
source: tests/unit/scripts/setup/required-keys.test.ts
sha256: 3db1694356f5434fd2ce8a52040883b28d3158853708506649c3c980d1620649
generated_at: 2026-09-27T16:14:42.374155+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/setup/required-keys.test.ts

## Purpose

Unit tests for the `fillableKeys` function, verifying that the list of placeholder keys `npm run setup` can fill is complete, clean, and consistent. The tests encode invariants (no missing well-known secrets, no non-placeholder entries, no duplicates) so the list stays correct as modules are added or removed without manual test maintenance.

## Key elements

- **`describe('fillableKeys')`** — top-level suite; calls `fillableKeys()` once and stores the result in `keys`.
- **`it('finds at least the well-known session and metrics secrets')`** — asserts the returned keys include `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, and `NODE_METRICS_TOKEN` (via `expect.arrayContaining`, so the set may be larger).
- **`it('never includes an entry with no placeholder to replace')`** — asserts `NODE_URL` is *not* in the list, since it is an operator-supplied value rather than a fillable stand-in.
- **`it('carries no duplicate keys')`** — asserts `new Set(names).size === names.length`, i.e. one entry per variable even when multiple modules declare the same key.

## Relationships

- **`scripts/setup/required-keys.ts`** — the sole import target. The test calls `fillableKeys()` and inspects its return value (an array of objects each exposing at least a `.key` string property). No other symbols from that module are used here.

## Notes

- The test intentionally uses `expect.arrayContaining` for the "well-known secrets" check so that newly added module secrets are covered automatically; only the absence of a placeholder (the `NODE_URL` case) or a structural violation (duplicates) would cause a failure.
- `fillableKeys()` is invoked once at the `describe` level, outside individual `it` blocks. If the function reads mutable global state or depends on module-registration order, the three tests share a single snapshot of that state.
