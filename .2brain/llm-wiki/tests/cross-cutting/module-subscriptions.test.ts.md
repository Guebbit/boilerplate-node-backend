---
source: tests/cross-cutting/module-subscriptions.test.ts
sha256: f189dc90715ad2692b2335a1acd58aa7a17cc73375191491635f0d500e7bf814
generated_at: 2026-11-08T09:28:20.854983+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/module-subscriptions.test.ts

## Purpose

Cross-cutting test that verifies every module's `subscribe()` hook actually registers event handlers and does so correctly. It exists because `subscribe` is the only manifest field that is pure behaviour (a side-effectful function call at boot) rather than a declarative value; an emptied or duplicated subscription is invisible to every other test in the suite.

## Key elements

- **`jest.mock('@kernel/events', …)`** – REPLACES `onDomainEvent` with a spy so calling each hook records its registrations without invoking any real handler.
- **`subscribers()`** – Filters `enabledModules` to those whose manifest declares a `subscribe` property.
- **`subscriptionsOf(appModule)`** – Clears the spy, calls the module's `subscribe()`, and returns the array of event names it registered for.
- **`'finds modules that subscribe at all'`** – Canary assertion: at least one module must declare a hook, preventing the remaining tests from passing vacuously.
- **`'registers at least one handler per declared hook'`** – Rejects hooks whose body is empty (registers zero events).
- **`'registers a handler for every event it names'`** – Rejects calls to `onDomainEvent(name)` where the second argument is missing or not a function (would cause a silent no-op at emit time).
- **`'names each event at most once per module'`** – Rejects duplicate registrations of the same event within a single module (copy-paste or two handlers that should be one).

## Relationships

- **`src/kernel/events.ts`** – The module under test's dependency. It is fully mocked here (`onDomainEvent` replaced with `jest.fn()`); the real `emitDomainEvent` path is never exercised.
- **`src/kernel/registry.ts`** – Supplies the `AppModule` type that defines the `subscribe` property (alongside `routes`, `locales`, `seeds`) this test validates.
- **`src/modules.ts`** – Source of the `enabledModules` array; the test iterates over that list to discover which modules declare hooks.

## Notes

- The mock uses `jest.requireActual` spread so other exports from `@kernel/events` remain available, but only `onDomainEvent` is stubbed.
- `subscriptionsOf` clears the spy before *and* after each call; the `beforeEach` at suite level adds a safety net. Do not rely on call history persisting across test cases.
- The "non-function handler" check exists because `emitDomainEvent` wraps handler invocation in a try/catch that logs and continues—so the production symptom of a malformed registration is a silent no-op, not an exception.
