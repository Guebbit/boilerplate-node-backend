---
source: tests/unit/infrastructure/http/middlewares/locale.test.ts
sha256: 65773478007b4cc06ce47919a8583e4d45100747ffcfbbb92197af9990eb58ca
generated_at: 2026-11-08T10:14:28.779680+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/locale.test.ts

## Purpose

Unit tests for the `attachLocale` Express middleware. Verifies locale negotiation from `Accept-Language`, AsyncLocalStorage context propagation around `next()`, response header correctness (`Content-Language`, `Vary`), fallback behaviour for invalid/unserved locales, and the interaction with the served-language registry.

## Key elements

- **`makeRequest(acceptLanguage?)`** — Builds a stub `Request` using `Object.create(express.request)` so the real `acceptsLanguages` (backed by `negotiator`) is present, then assigns a headers object.
- **`makeResponse()`** — Returns a stub `Response` with mocked `set` and `vary` (both `jest.fn()`).
- **`negotiate(header)`** — Convenience helper: runs `attachLocale` once and returns `request.locale` for quick assertion.
- **`describe('attachLocale')`** — Core contract tests: locale assignment, context scoping (`getCurrentLocale` / `getLocaleContext` inside vs. outside `next`), context cleanup after the chain, `Content-Language` accuracy, `Vary` append semantics, no-throw on malformed headers, single `next` call, case/regional resolution, q-weight ordering, `q=0` exclusion.
- **`describe('behaviour deltas from the hand-rolled parser')`** — Pins two deliberate differences from the old `negotiateLocale`: unparseable q-weight drops the tag (instead of defaulting to 1.0), and bare `*` resolves to the fallback (achieved by ordering the fallback first in the candidate list).
- **`describe('attachLocale against the served languages')`** — Exercises the `setServedLanguages` / `resetServedLanguages` registry: switched-on registered languages, switched-off deployed languages, unregistered languages, regional matching (`es-MX` → `es`), and priority among multiple switched-on languages.

## Relationships

- **`src/infrastructure/http/middlewares/locale.ts`** — The unit under test; imports `attachLocale`.
- **`src/infrastructure/i18n/index.ts`** — Re-exports the i18n API the tests assert against: `getCurrentLocale`, `getFallbackLocale`, `getLocaleContext`, `listServedLocales`, `resetServedLanguages`, `setServedLanguages`.
- **`src/infrastructure/i18n/context.ts`** — Source of `getCurrentLocale` / `getLocaleContext`; the tests verify AsyncLocalStorage is active only inside `next`.
- **`src/infrastructure/i18n/served.ts`** — Source of `setServedLanguages` / `resetServedLanguages` / `listServedLocales`; the "served languages" describe block drives the registry state.
- **`src/infrastructure/i18n/catalog.ts`** — Underpins the locale→translation binding that `request.t` exposes (asserted as `typeof request.t === 'function'`).
- **`tests/support/stub.ts`** — Provides `asStub<T>` to wrap plain objects as typed stubs for the request/response fakes.

## Notes

- Requests are built with `Object.create(express.request)` specifically so `acceptsLanguages` is the **real** `negotiator`-backed method, not a hand-rolled stand-in. This means the tests exercise `negotiator`'s edge-case semantics (e.g., unparseable q-weights) rather than a simplified parser.
- The `Vary` test asserts `response.vary` (append) rather than `response.set` (replace), because the middleware must not clobber a `Vary: Origin` already set by CORS middleware.
- The "served languages" block calls `resetServedLanguages()` in `afterEach`; forgetting this would leak registry state into subsequent test files if they share the module cache.
- The `negotiate` helper is module-scoped (not inside a `describe`), so it's available to both the main and served-languages suites without duplication.
