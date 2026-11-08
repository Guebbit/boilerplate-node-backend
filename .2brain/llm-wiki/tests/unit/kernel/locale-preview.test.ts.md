---
source: tests/unit/kernel/locale-preview.test.ts
sha256: dd124321456525a5f54408be8eeb68fed7c822f824c4ea116795f0eb58749e37
generated_at: 2026-11-08T10:27:10.200379+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/locale-preview.test.ts

## Purpose

Unit test for the `previewDraftLanguage` middleware. It verifies that the middleware re-binds a request to a draft language **only** when the caller's first `Accept-Language` entry is a switched-off (draft) language *and* the translation port grants that caller draft-read access. Every other path must leave the locale set by the upstream `attachLocale` step untouched.

## Key elements

- **`STAFF`** – a fixed stub `Caller` (`{ id: 'staff' }`) used as the identity the port double checks against.
- **`portAllowing(allowed: boolean)`** – factory returning a `TranslationPort` stub whose `canPreviewDrafts` returns `allowed && caller === STAFF`. Isolates the single method the middleware depends on.
- **`run(ranges, caller?)`** – assembles a mock Express `Request`/`Response`, invokes `previewDraftLanguage`, captures the `next()` call, and returns `{ request, response, headers, inside }` so each assertion can inspect locale, set headers, and the i18n context simultaneously.
- **`beforeEach` / `afterEach`** – register served languages (`fr` live, `de` draft) and a permissive port before each test; deregister the port and reset served languages after each test to prevent leakage.
- **Test cases** – cover: successful re-bind; draft behind a live language; wildcard; empty `Accept-Language`; live language only; regional subtag (`de-AT`); anonymous caller; caller without permission; no port registered.

## Relationships

- **`src/kernel/middlewares/locale-preview.ts`** – the module under test; the test imports `previewDraftLanguage` directly.
- **`src/kernel/translation.ts`** – provides `registerTranslationPort` (setup/teardown) and the `TranslationPort` type used to build the port stub.
- **`src/infrastructure/i18n/served.ts`** – `setServedLanguages` / `resetServedLanguages` define which language is live vs. draft for the test scenario.
- **`src/infrastructure/i18n/context.ts`** – `getLocaleContext` is called inside the `next()` callback to assert the locale/preview state the middleware wrote into the async-local context.
- **`src/infrastructure/i18n/index.ts`** – barrel re-export consumed by the `@infrastructure/i18n` import alias.
- **`src/infrastructure/http/middlewares/cache.ts`** – `isDraftPreview(response)` is used as an assertion helper to confirm (or deny) the draft-preview marker on the response.
- **`src/types/auth-context.ts`** – source of the `Caller` type used in stubs and the `request.caller` field.
- **`tests/support/stub.ts`** – `asStub` utility that gives type-safe, minimal object stubs for `Caller`, `TranslationPort`, `Request`, and `Response`.

## Notes

- The `run` helper captures the i18n context **inside** the `next()` invocation, meaning it reads the AsyncLocalStorage value the middleware populated. Asserting on `inside()` therefore tests the context as downstream middleware would see it.
- The port stub performs an **identity check** (`caller === STAFF`) in addition to the boolean flag, so a test that swaps in a different caller (or `null`) exercises the "wrong caller" path without needing a second port factory.
- `response.vary` is stubbed as a plain `jest.fn()` and is never asserted; the test focuses on `Content-Language`, `Cache-Control`, and the i18n context rather than `Vary` header behavior.
- Teardown in `afterEach` deregisters the port *and* resets served languages, so a test that intentionally calls `registerTranslationPort(undefined)` (the "locales uninstalled" case) does not leak a stale port into the next test.
