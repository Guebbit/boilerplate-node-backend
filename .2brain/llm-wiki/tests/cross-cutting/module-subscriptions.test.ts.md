---
source: tests/cross-cutting/module-subscriptions.test.ts
sha256: f189dc90715ad2692b2335a1acd58aa7a17cc73375191491635f0d500e7bf814
generated_at: 2026-09-23T19:57:23.848799+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/module-subscriptions.test.ts

## Purpose

Verifies that every module declaring a `subscribe` hook actually registers at least one valid event handler, with no duplicates per event. This exists because `subscribe` is pure side-effect behaviour — unlike `routes`, `locales`, or `seeds` (which are values other tests can read), a silently emptied or malformed subscription produces no visible failure elsewhere in the suite.

## Key elements

- **`jest.mock('@kernel/events')`** — Replaces `onDomainEvent` with `jest.fn()` so hooks can be called and their registrations _inspected_ without the handlers ever executing or leaking into other suites.
- **`subscribers()`** — Filters `enabledModules` to those whose manifest includes a `subscribe` property.
- **`subscriptionsOf(appModule)`** — Clears the mock, calls `appModule.subscribe()`, and returns the array of event names recorded in `onDomainEvent` calls.
- **Test: "finds modules that subscribe at all"** — Canary assertion; if `subscribers()` is empty every subsequent test passes vacuously, which would itself be a bug.
- **Test: "registers at least one handler per declared hook"** — Flags any module whose `subscribe()` produces zero `onDomainEvent` calls.
- **Test: "registers a handler for every event it names"** — Catches `onDomainEvent(name)` called without a second argument; in production this would fail silently inside a try/catch at emit time.
- **Test: "names each event at most once per module"** — Detects duplicate subscriptions to the same event within a single module (copy-paste or two handlers that should be one).

## Relationships

- **`src/kernel/events.ts`** — Mocked (replaced) at module level; the test reads `onDomainEvent` call arguments but never invokes the real bus or dispatches events.
- **`src/modules.ts`** — Source of `enabledModules`, the concrete list of module manifests the suite iterates over.
- **`src/kernel/registry.ts`** — Provides the `AppModule` type used to type the module objects under inspection.

## Notes

- The mock **replaces** `onDomainEvent` rather than spying on it: handlers passed as the second argument are never called, so side effects are isolated.
- `subscriptionsOf` calls `mockClear()` immediately before invoking `subscribe()`, so the recorded calls belong exclusively to that module — but this means the function is not re-entrant; the duplicate-detection test calls it via `flatMap` in sequence, not in parallel.
- The malformed-handler test (non-function second arg) mirrors a real production failure mode: `emitDomainEvent` wraps handler invocation in a try/catch that logs and continues, so the symptom is a silent no-op, not a crash.
