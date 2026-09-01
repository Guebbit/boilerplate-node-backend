# tests/cross-cutting/module-subscriptions.test.ts

## Purpose

Verifies that every module declaring a `subscribe` hook in its manifest actually registers at least one real event handler, and that no module registers the same event twice. Without this test, an emptied `subscribe` body is invisible: the module still registers routes and passes every other cross-cutting check, but silently stops reacting to the rest of the system.

## Key elements

- **`subscribers()`** — filters `enabledModules` down to those with a non-undefined `subscribe` property.
- **`subscriptionsOf(appModule)`** — clears the mocked `onDomainEvent`, invokes the module's `subscribe()`, and returns the list of event names it registered for.
- **`"finds modules that subscribe at all"`** — canary assertion: at least one module must declare a `subscribe` hook, so the remaining tests aren't vacuously true.
- **`"registers at least one handler per declared hook"`** — flags any module whose `subscribe()` calls `onDomainEvent` zero times.
- **`"registers a handler for every event it names"`** — catches the case where `onDomainEvent(name, handler)` is called with a non-function second argument (which would produce a silent no-op at emit time in production).
- **`"names each event at most once per module"`** — detects duplicate subscriptions to the same event within a single module (copy-paste or split responsibilities).

## Relationships

- **`src/kernel/events.ts`** — the module is `jest.mock`-ed so that `onDomainEvent` becomes a `jest.fn()`. The test reads `mock.calls` to inspect registrations without invoking handlers or leaking subscriptions into other suites.
- **`src/modules.ts`** — provides `enabledModules`, the array of module manifests the test iterates over.
- **`src/kernel/registry.ts`** — supplies the `AppModule` type that shapes how `subscribe` is typed and accessed.

## Notes

- The mock replaces `onDomainEvent` rather than driving the real event bus; handlers are never actually invoked.
- `beforeEach` clears the mock so each test sees a fresh call log.
- The "non-function handler" check exists because `emitDomainEvent` wraps handler calls in a try/catch that logs and continues — a missing handler fails silently in production, not with a crash.
