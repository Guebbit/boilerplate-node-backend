# tests/cross-cutting/module-subscriptions.test.ts

## Purpose

Verifies that every module's `subscribe()` hook actually registers event handlers and only listens to events from modules it explicitly declares in `dependsOn`. This check exists because `subscribe` is the sole manifest field that is pure behaviour — an empty body is invisible to every other cross-cutting test (routes, seeds, dependsOn are all statically readable values).

## Key elements

- **`jest.mock('@kernel/events', …)`** — replaces `onDomainEvent` with a `jest.fn()` spy while preserving the rest of the module, so `subscribe()` calls are recorded but handlers never execute.
- **`subscribers()`** — filters `enabledModules` to entries where `subscribe !== undefined`.
- **`subscriptionsOf(appModule)`** — clears the spy, calls `appModule.subscribe()`, returns the array of event names passed to `onDomainEvent`.
- **Test: "finds modules that subscribe at all"** — canary assertion that at least one subscriber exists, preventing all subsequent assertions from passing vacuously.
- **Test: "registers at least one handler per declared hook"** — flags modules whose `subscribe` body is effectively empty.
- **Test: "registers a handler for every event it names"** — ensures the second argument to `onDomainEvent` is a function (a missing arg would silently no-op at emit time in production).
- **Test: "names each event at most once per module"** — detects duplicate subscriptions within a single module.
- **Test: "listens only to events from itself or a module it declares"** — infers event ownership from the first name segment of the event string, then cross-references against the subscriber's `dependsOn` list.

## Relationships

- **`src/modules.ts`** — imports `enabledModules`, the source of truth for which modules are active.
- **`src/kernel/events.ts`** — mocked (`onDomainEvent` replaced with a spy); this is the function every `subscribe` hook calls to register handlers.
- **`src/kernel/registry.ts`** — imports the `AppModule` type used to type the module objects under test.

## Notes

- The mock is a **replacement**, not a drive: it captures registrations without invoking handlers, avoiding cross-suite subscription leakage.
- Event ownership is inferred heuristically by matching the lowercased first segment of the event name against module names (with trailing-`s` stripped). This assumes event names follow the `entity.verb` / `entity.past-verb` convention; a module name that doesn't prefix-match will not be flagged as undeclared.
- `mockClear()` is called before every `subscribe()` invocation to keep per-module recordings isolated.
