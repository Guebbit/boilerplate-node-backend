---
source: src/infrastructure/http/middlewares/locale.ts
source_sha256: ffcacd35b475d3766a9956168415f37bcc34dd41bd98af7cdaea1c0847ab3759
context_sha256: ca767a5ae43b694143b3909d86e15d1f78f1cee53b0d52755171829b9a05ae0c
generated_at: 2026-11-22T02:50:40.160743+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/locale.ts

## Purpose
Express middleware that negotiates the request's language once, before routing, and exposes it both explicitly (`request.locale`, `request.t`) and ambiently via AsyncLocalStorage (so services, repositories and Zod thunks can import `t` from `@infrastructure/i18n`). It also sets `Content-Language` and `Vary: Accept-Language` on responses, except for language-neutral reads.

## Key elements
- `attachLocale(request, response, next)`: the middleware. Negotiates a locale, builds a context with `createLocaleContext`, sets `request.locale`/`request.t`, labels the response (or records it for later if the route is language-neutral), then calls `next` inside `runWithLocaleContext`.
- `negotiateLocale` (private): uses Express `request.acceptsLanguages(...listServedLocales())`. Returns the match, or `getFallbackLocale()` when nothing matches, the header is missing, or it refuses everything.
- `LANGUAGE_NEUTRAL_READS`: exported list of OpenAPI-style path templates (`/config`, `/shop`, `/payments/methods`, `/delivery/methods`, `/products/facets`, `/locales`, `/locales/apps`, `/locales/{locale}`, `/locales/{locale}/messages`, `/locales/{locale}/dictionary`) whose successful body doesn't depend on language.
- `isLanguageNeutral(request)`: true for GET/HEAD on a listed path. It strips one trailing slash and matches against regexes compiled once at load (`{name}` matches one segment).
- `labelNeutralRefusal(response)`: exported. For a response recorded as language-neutral, it sets `Content-Language` and `Vary` so a translated refusal is labelled. It does nothing for other responses.
- `labelWithLocale` (private): sets `Content-Language` and `Vary: Accept-Language`.
- `unlabelledLocales`: a `WeakMap<Response, string>` holding the negotiated locale for unlabelled neutral responses.

## Relationships
- `@infrastructure/i18n` (`index.ts`, with `context.ts`, `catalog.ts` and `served.ts` behind it): supplies `createLocaleContext`, `runWithLocaleContext`, `listServedLocales` and `getFallbackLocale`.
- `src/infrastructure/http/response.ts`: `rejectResponse` calls `labelNeutralRefusal`. The WeakMap choice mirrors `doNotRetryResponses` there.
- `src/app.ts`: mounts `attachLocale` before the routes.
- `tests/unit/infrastructure/http/middlewares/locale.test.ts`: unit tests for the middleware.
- `tests/integration/language-neutral-routes.test.ts`: keeps `LANGUAGE_NEUTRAL_READS` in sync with the routes that are actually `languageNeutral`.
- `src/modules/payments/tests/integration/webhook-no-body.test.ts` and `webhook-rate-limit.test.ts`: integration tests that exercise requests passing through this middleware.

## Notes
- The neutral list is kept here rather than as a route flag because the middleware runs before routing and can't know which route will match. A header set too early couldn't be stripped later.
- The fallback locale is offered first in `listServedLocales()`. `negotiator` resolves `*` or a missing header to the first candidate, so that ordering makes both cases resolve to the fallback.
- A `WeakMap` is used instead of `response.locals` because `rejectResponse` is called with hand-built response stubs that have no `locals`.
- Language-neutral reads get no `Content-Language` or `Vary` on success. A refusal on them does get both, because the refusal is translated.
- `negotiateLocale` takes `Pick<Request, 'acceptsLanguages'>` and `isLanguageNeutral` takes `Pick<Request, 'method' | 'path'>`, so tests can pass minimal stubs.
