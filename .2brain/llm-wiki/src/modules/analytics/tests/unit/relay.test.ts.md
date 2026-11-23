---
source: src/modules/analytics/tests/unit/relay.test.ts
source_sha256: 6dbddb855e692153874af085c871127a658da20b56f55acf6a2f6718e44d45ea
context_sha256: d86b0568808e05d35ebf025035cc07ce579efb7c8d3b9ca9205729ddd7a2b9dc
generated_at: 2026-11-22T04:18:56.594260+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/tests/unit/relay.test.ts

## Purpose
Unit tests for the analytics relay (`relayEvent` / `registerBrowserEvents` in `services/relay`). They verify that the relay has no hardcoded knowledge of event names: it looks the request body's `event` up among events declared by registered modules, and passes the analytics port whatever that module's `toReport` produced.

## Key elements
- `mockEmit`: a `jest.fn()` standing in for the analytics provider's emit. The mocked `@infrastructure/observability/analytics` module routes `emitAnalyticsEvent` to it and makes `buildAnalyticsBase` return `{ distinctId: 'anonymous' }`.
- `CONTEXT`: an empty `CallerContext` stub (via `asStub`), which the stubbed base builder ignores.
- `body(event)`: helper that builds an `AnalyticsEventRequest` stub with the given `event` and an `extra: 1` field.
- `afterEach`: resets the registry with `registerBrowserEvents({})` and resets `mockEmit`.
- Test cases in `describe('relayEvent')`:
  - **Owning module:** emits what the owning module built. `toReport` receives the body (`{ event, extra: 1 }`), and `mockEmit` receives the base merged with the returned `{ event, properties }`.
  - **Unowned event:** an event no registered module owns is dropped, with no emit.
  - **Inherited property:** a name like `'constructor'` is not resolved as an event, with no emit.

## Relationships
- `src/modules/analytics/services/relay.ts`: the unit under test. `registerBrowserEvents` and `relayEvent` are imported from it, after the mock is declared.
- `src/types/index.ts` (via the `@types` alias): supplies the `AnalyticsEventRequest` and `CallerContext` types.
- `src/types/auth-context.ts`: related through the types graph. The test only imports `CallerContext` from `@types`.
- `tests/support/stub.ts` (via the `@tests/stub` alias): provides `asStub`, used to build the partial typed stubs.

## Notes
- The mock is declared before the relay import so the relay picks up the stubbed analytics module.
- The "inherited property" case guards against looking up events with a plain object lookup that would match prototype members such as `constructor`.
