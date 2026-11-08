---
source: tests/unit/infrastructure/runtime/cluster-policy.test.ts
sha256: a73ac2ac421c85dad96fb601d0118035b684f262f407cb06b9728a2ed6039c24
generated_at: 2026-11-08T10:23:09.474902+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/cluster-policy.test.ts

## Purpose

Unit tests for the cluster-policy module, covering two responsibilities: computing how many worker processes the primary should fork (`workerTarget`) and deciding what to do after a worker crashes (`crashVerdict`). It locks in the documented semantics so refactors don't silently change forking or backoff behavior.

## Key elements

- **`workerTarget(requested, cpus)`** — tested via three cases:
  - Returns `requested` when it is positive (e.g. 3).
  - Treats `0` as "one worker per available CPU" (returns `cpus`).
  - Clamps to a minimum of 1 regardless of inputs.

- **`crashVerdict(timestamps, nowMs, policy)`** — tested via five cases against a shared `policy` object (`windowMs`, `backoffBaseMs`, `backoffMaxMs`, `maxCrashes`):
  - **Respawn, base delay** — no recent crashes → `delayMs = backoffBaseMs`.
  - **Exponential backoff** — two crashes in-window → delay doubles per crash.
  - **Window pruning** — crashes older than `windowMs` are dropped from `recentCrashes`; only the current `nowMs` remains.
  - **Delay cap** — with a small `backoffMaxMs`, the computed delay is clamped to that max.
  - **Give-up** — when the in-window crash count exceeds `maxCrashes`, the action is `'give-up'`.

## Relationships

- **`src/infrastructure/runtime/cluster-policy.ts`** — the sole SUT. This file imports `crashVerdict` and `workerTarget` from it (via the `@infrastructure/runtime/cluster-policy` alias) and asserts their return shapes (`action`, `delayMs`, `recentCrashes`).

## Notes

- The "zero means one-per-CPU" convention is explicitly called out as documented in `.env-example`; if that doc changes, this test (and the implementation) must follow.
- The `windowMs` pruning test asserts that `recentCrashes` is *replaced* with `[nowMs]`, not merely filtered — the current crash is always appended.
- `backoffMaxMs` and `maxCrashes` are varied via a spread copy (`wide`) rather than mutating the shared `policy`, keeping each test independent.
