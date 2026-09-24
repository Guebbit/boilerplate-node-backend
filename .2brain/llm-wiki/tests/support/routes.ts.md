---
source: tests/support/routes.ts
sha256: 0fbcc2d3534f2f4eccdd520f0d1f0574ecf54c9be59bb73053813df55c8a1a92
generated_at: 2026-09-23T20:13:41.120181+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routes.ts

## Purpose

Test-support utility that reads an Express router's mounted route table (method, path, middleware chain) and provides drop-in mock factories for middleware that are _closures_ (cache, rate-limit, upload, step-up-auth). Because Express stores the function it was given, not the factory call, these mocks label the returned middleware with the factory's arguments so a test can assert the full configuration of every route in a module.

## Key elements

- **`ROUTE_LABEL`** (`Symbol.for('tests.routeLabel')`) — the property key a labelled middleware carries its factory-call string on.
- **`RouteRow`** (interface) — shape of one row in the returned table: `method`, `path`, `chain: string[]`, optional `permissionKey`.
- **`labelled(label)`** — returns a no-op Express middleware with `[ROUTE_LABEL]` set; the building block every mock uses.
- **`text`, `list`, `parseValue`** — render/parsing helpers that turn factory arguments into stable, distinguishable strings (arrays become `a|b`, `undefined` becomes `·`) and back.
- **`optionsOf(chain, factory)`** _(exported)_ — finds the `factory(...)` entry in a chain and parses its `key=value` pairs back into a `Record<string, unknown>`. Throws if the factory is absent from the chain.
- **`cacheMock()`** _(exported)_ — replaces `@infrastructure/http/middlewares/cache`. Records TTL, tags, keyParameters, keyAs, browserRevalidate. Spreads the real module first so named exports like `noStore` still resolve.
- **`securityMock()`** _(exported)_ — replaces `@infrastructure/http/middlewares/rate-limit`. Relabels `buildRateLimiter` by `budget.namespace` and pins the three file-level limiters (`global`, `api-key`, `uploads`).
- **`routeFlagMock()`** _(exported)_ — replaces `@infrastructure/http/middlewares/route-flag`; labels the flag name.
- **`authGuardsMock()`** _(exported)_ — replaces `@kernel/middlewares/authorizations`. Passes through `isAuth`/`requirePermission`/`getAuth`; labels `requireFreshAuth`/`requireFreshAuthWhen` with their `maxAgeSeconds` tier.
- **Upload mock** _(exported, truncated)_ — calls through to the real `upload.single` so `validateUploadedImages` / `quarantineUploadedImages` remain visible in the chain, while prepending the field name as a label.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — `cacheMock` spreads its real exports then overrides `setCache`, `searchCache`, `invalidateCache` with labelling wrappers.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `securityMock` spreads real exports then overrides `buildRateLimiter` and the three singleton limiters.
- **`src/infrastructure/http/middlewares/upload.ts`** — the upload mock calls through to real `upload.single` and prepends a field-name label.
- **`src/kernel/middlewares/authorizations.ts`** — `authGuardsMock` spreads real exports then overrides the two step-up factories.
- **`src/modules/*/tests/unit/routes.test.ts`** (account, addresses, cart, delivery, feedback, inventory, locales, observability, orders, payments, products) — each test file calls the relevant `*Mock()` factories inside its own `jest.mock` hoist and asserts the full route table produced by `routeTable`.

## Notes

- **`jest.mock` is per-module-registry and hoisted.** It cannot be applied from this helper; every consuming test file must declare its own `jest.mock(...)` one-liner. The factory must use `require(...)` rather than the imported binding because Jest forbids closing over module scope inside a mock factory.
- **Spreading the real module first is load-bearing.** E.g. `cacheMock` preserves `noStore` so a route's `router.use(noStore)` does not resolve to `undefined`. Forgetting the spread silently breaks any named (non-factory) export.
- **`optionsOf` is a string-parsing stopgap.** It inverts the `text`/`list` renderers _in this same file_ to keep the format coupling local. It only handles `key=value` pairs; a leading positional argument (e.g. `setCache`'s TTL) has no key and is skipped. If the render format changes, `parseValue` must change in lockstep.
- **`passThrough.bind(undefined)` creates a fresh function identity per call** without a new closure. This is what lets two routes calling the same factory get distinct middleware objects (required for Express to distinguish them in the stack) while sharing one `passThrough` definition.
- **`routeTable` and the walker** are referenced in comments and the `RouteRow` interface but were not visible in the truncated content; they live later in this file and are the primary assertion surface for module test files.
