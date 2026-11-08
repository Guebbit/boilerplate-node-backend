---
source: tests/support/problem.ts
sha256: 99cc09f2a20f8cb267f245f1f09cac2f6961478eb6ccae029b806aa73809350f
generated_at: 2026-11-08T09:57:32.169662+00:00
model: ollama:qwen3.8:27b
---

# tests/support/problem.ts

## Purpose

Shared test helper that normalises RFC 7807 problem-details response bodies by stripping the per-request `instance` field. Because `instance` embeds the request UUID, two responses to two different requests will always differ on that one field even when they are semantically identical; this helper lets tests compare the remaining members directly.

## Key elements

- **`withoutInstance(body: object): object`** – Spreads the given problem-details body and overwrites `instance` with `undefined`, returning a new object. Intended for use in `expect(...).toEqual(withoutInstance(expected))`-style assertions.

## Relationships

- **Imported by all listed test files** (contract tests, integration tests for account lifecycle, delete-account, login-restore, bad-bodies, and malformed-ids) to normalise response bodies before equality comparisons.
- Lives under `tests/support/`, making it a shared utility accessible to both `tests/integration/` and module-local test suites (`src/modules/account/tests/`).

## Notes

- The function sets `instance` to `undefined` rather than deleting the key, so the property still exists on the returned object. `toEqual` treats `undefined`-valued keys as absent, which is the intended behaviour; a strict `toBe`-style check on key presence would not.
- The helper does **not** validate that the body actually conforms to problem-details shape; it simply spreads whatever object it receives.
