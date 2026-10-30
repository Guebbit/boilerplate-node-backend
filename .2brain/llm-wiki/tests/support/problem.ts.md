---
source: tests/support/problem.ts
sha256: 99cc09f2a20f8cb267f245f1f09cac2f6961478eb6ccae029b806aa73809350f
generated_at: 2026-10-29T07:09:43.961955+00:00
model: ollama:qwen3.8:27b
---

# tests/support/problem.ts

## Purpose

A single-function test helper that normalises problem-details response bodies by stripping the per-request `instance` field, so tests can assert that two distinct requests received structurally identical error responses.

## Key elements

- **`withoutInstance(body: object): object`** — Spreads the given problem-details body and sets `instance` to `undefined`, returning a new object. Used to remove the only field that is guaranteed to differ between two otherwise-identical error responses.

## Relationships

- Imported by every listed neighbor (contract tests under `src/modules/account/tests/contract/`, integration tests under `tests/integration/`, and module integration tests under `src/modules/account/tests/integration/`) wherever a test needs to compare two problem-details bodies that differ only in `instance`.
- No runtime dependency on `src/` production code; it is a pure test-support utility.

## Notes

- `instance` is constructed as `urn:uuid:<request-id>`, so it is inherently unique per request and must be excluded from equality comparisons.
- The function does **not** delete the key; it sets `instance: undefined`. Callers should compare with a matcher or assertion that treats `undefined` members as absent (e.g. `toEqual` in Jest ignores `undefined` properties, but `toStrictEqual` does not).
- The parameter type is `object` (not a branded type), so callers are responsible for passing an already-parsed JSON body.
