---
source: src/modules/account/tests/unit/epoch.test.ts
sha256: 3601ec1ab96af20afae7b85c50783efb93b0d701b8991c91b7718a2e7ea05eb9
generated_at: 2026-10-14T09:20:54.452390+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/epoch.test.ts

## Purpose

Unit tests for `predatesSessionEpoch`, the single comparison shared by the account resolver and the session-refresh path. The suite pins down the boundary semantics so that either call site can rely on the same "is this token older than the epoch" decision without re-deriving the rule.

## Key elements

- **`describe('predatesSessionEpoch')`** — the sole top-level block; imports `predatesSessionEpoch` from `../../session/epoch` and exercises it with four focused cases.
- **`epoch` / `epochSecond`** (local constants) — a fixed `Date` (`2026-10-06T12:00:00.900Z`) and its millisecond value truncated to whole seconds, used as the reference point for every assertion.
- **Test: "never refuses when no event ever moved the epoch"** — asserts `predatesSessionEpoch(0, undefined)` returns `false`, locking in the no-epoch guard.
- **Test: "refuses a token stamped in an earlier second"** — asserts a token one second before the epoch is refused (`true`).
- **Test: "keeps a token stamped in the very second of the bump"** — asserts a token in the *same* second as the epoch is **not** refused (`false`); this is the critical boundary.
- **Test: "keeps a token stamped later"** — asserts a token five seconds after the epoch is not refused.

## Relationships

- **`src/modules/account/session/epoch.ts`** — the module under test. The test file imports `predatesSessionEpoch` directly and exercises its contract; no other imports or side effects connect the two.

## Notes

- The boundary test ("very second of the bump") documents that the comparison is `tokenSecond < epochSecond` (strictly-less-than), not `<=`. A token issued in the same second as the epoch bump is intentionally allowed to survive. If the implementation ever changes to `<=`, that test is the one that will catch the regression.
- The function signature accepts `epoch` as `Date | undefined`; passing `undefined` is a first-class case (meaning "no epoch event occurred"), not an error.
- `epochSecond` is derived via `Math.floor(epoch.getTime() / 1000)`, so sub-second precision (`.900`) is discarded before comparison — the function operates at whole-second granularity.
