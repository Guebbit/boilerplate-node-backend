---
source: tests/support/environment.ts
sha256: 7f4d57642b976b2cf9a3a0df80ca0100e7fad1ccb3e3ee492f557517c2baffb6
generated_at: 2026-09-23T20:10:39.277746+00:00
model: ollama:qwen3.8:27b
---

# tests/support/environment.ts

## Purpose

Provides test-scoped helpers for safely mutating `process.env` and guaranteeing restoration, so that config-driven behavior (read lazily at use time) can be varied per test case without leaking state into subsequent cases or files.

## Key elements

- **`withEnvironment(key, value, body)`** — Sets a single env variable for the duration of an async `body`, then restores it. Convenience wrapper around `withEnvironmentOverrides`.
- **`withEnvironmentOverrides(overrides, body)`** — Sets multiple env variables for the duration of an async `body`, restores all of them in a `finally` block (survives throws), and **returns whatever `body` resolves to**. Designed for the module-reload pattern: callers run `jest.resetModules()` + dynamic `import()` inside `body` and receive the freshly-instantiated module.
- **`withoutEnvironment(keys, body)`** — Deletes the listed env variables for the duration of an async `body`, then restores whatever they previously held (including the "key was absent" distinction).
- **`withoutEnvironmentInThisFile(keys)`** — File-level variant of `withoutEnvironment`: registers a `beforeEach` that deletes the keys and an `afterEach` that restores them, so every case in the file starts clean without per-case wrapping.
- **`restore(previous)`** (module-private) — Core restore logic: for each captured key, deletes it if it was previously absent, or writes back its prior value.

## Relationships

- **All graph-neighbor test files** (account, antibot, cart, inventory, orders, payments, products, webhooks, `required-config`, `mailer-transport`) import one or more of the above helpers to isolate config-dependent assertions.
- **`tests/support/rate-limit-harness.ts`** — Likely a consumer; rate-limit budgets are captured at import time, making it a natural user of `withEnvironmentOverrides`'s return-value + module-reload pattern.
- **`tests/support/setup.ts`** (referenced in JSDoc) — Establishes baseline env values (e.g., for the `shop`/`order.awaitingTransfer` scenario). The "without" helpers exist specifically to express "unset" against that baseline, since `delete` alone would lose the worker's original value.

## Notes

- **Restoration distinguishes "was absent" from "was empty string."** `restore` uses `undefined` in the captured `Map` to mean "key did not exist" and issues a `delete` rather than writing `""`. Leaving an empty string where no key was present is treated as an environment change.
- **`withEnvironmentOverrides` is the only helper that passes through `body`'s resolved value.** The others return `void`. Use it when you need the result of a dynamic import (module-reload pattern).
- **`withoutEnvironmentInThisFile` is the only helper that registers Jest lifecycle hooks** (`beforeEach`/`afterEach`) rather than wrapping a callback. Call it once at the top of a test file; it cannot be nested or used per-case.
- All mutations go through `process.env` directly; there is no abstraction over the env object itself.
