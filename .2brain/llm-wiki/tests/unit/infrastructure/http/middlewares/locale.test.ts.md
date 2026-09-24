---
source: tests/unit/infrastructure/http/middlewares/locale.test.ts
sha256: f064b1697587663a5bf2a39e7cec1732a0b6146a3abec8d488622c0f4a85fb91
generated_at: 2026-09-23T20:21:24.716929+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/locale.test.ts

## Purpose

Unit tests for the `attachLocale` Express middleware. Verifies that locale negotiation, AsyncLocalStorage context propagation, response header setting, and `Vary` header behaviour all work correctly, including edge cases around malformed `Accept-Language` headers and deliberate behavioural differences from a previous hand-rolled parser.

## Key elements

- **`makeRequest(acceptLanguage?)`** — Builds a realistic Express `Request` via `Object.create(express.request)`, so `acceptsLanguages` (backed by `accepts`/`negotiator`) is the *real* implementation, not a mock.
- **`makeResponse()`** — Returns an `asStub`-typed response whose `set` and `vary` are `jest.fn()` spies.
- **`describe('attachLocale')`** — Top-level suite covering:
  - Negotiated locale + bound `t` on the request
  - `next()` executing *inside* the locale context (`getCurrentLocale` / `getLocaleContext` visible)
  - Context not leaking after the chain returns
  - `Content-Language` reflecting the resolved (possibly fallback) locale
  - `vary('Accept-Language')` appending (not replacing) for shared-cache correctness
  - Graceful fallback on garbage headers
  - `next` called exactly once
  - Case-, region-, and q-weight negotiation (table-driven)
- **`describe('behaviour deltas from the hand-rolled parser')`** — Two explicit assertions that pin down intentional differences from the old `negotiateLocale`: unparseable q-weights now drop the tag (falling to `getFallbackLocale()`), and `*` resolves to the fallback via candidate ordering.

## Relationships

- **`src/infrastructure/http/middlewares/locale.ts`** — The module under test; imports `attachLocale` directly.
- **`src/infrastructure/i18n/index.ts`** — Barrel export providing `getCurrentLocale`, `getFallbackLocale`, `getLocaleContext`, `listSupportedLocales`.
- **`src/infrastructure/i18n/context.ts`** — Source of the AsyncLocalStorage-based context; the "runs `next` inside the locale context" and "leaves no context behind" tests exercise its enter/exit semantics.
- **`src/infrastructure/i18n/catalog.ts`** — Underlies `listSupportedLocales` and `getFallbackLocale`, which the tests use to assert valid/fallback resolution.
- **`tests/support/stub.ts`** — Provides `asStub<T>` used to type both the request and response fakes.

## Notes

- The request fixture deliberately uses the **real** `accepts`/`negotiator` stack rather than a hand-rolled stand-in. The two "behaviour delta" tests exist precisely because `negotiator` handles unparseable q-weights and wildcards differently from the old parser; they lock in the *chosen* semantics so a future refactor that re-introduces the old behaviour fails loudly.
- `response.vary` is asserted (not `response.set`) because the middleware must **append** to an existing `Vary` header (e.g. one set by CORS), not overwrite it.
- The "leaves no locale context behind" test guards against an AsyncLocalStorage leak that would silently affect subsequent requests in the same event-loop tick.
