# src/infrastructure/i18n/context.ts

## Purpose

Provides request-scoped, locale-bound translation so that concurrent requests in different languages don't interfere. `i18next`'s global instance holds one active language; this module replaces that with an `AsyncLocalStorage`-carried `t` per request and offers `runWithLocale` for out-of-band work (queues, boot-time jobs) that falls outside the request's async chain.

## Key elements

- **`LocaleContext`** — interface pairing a BCP-47 `locale` string with a `TFunction` already bound to that locale.
- **`translator(locale)`** — thin wrapper around `i18next.getFixedT(locale)`; returns a `TFunction` that touches no global state. The lowest-level primitive in the module.
- **`createLocaleContext(locale)`** — builds a `LocaleContext` object from a locale string.
- **`runWithLocaleContext(context, callback)`** — runs `callback` (and everything it awaits) with `context` stored in `AsyncLocalStorage`.
- **`runWithLocale(locale, callback)`** — convenience wrapper: creates the context internally, then calls `runWithLocaleContext`. Intended for workers, background jobs, tests.
- **`getLocaleContext()`** — returns the ambient `LocaleContext` or `undefined` when outside a bound chain.
- **`getCurrentLocale()`** — resolves the active locale with a three-level fallback: ambient context → `i18next.language` → `getDefaultLocale()` from the catalog.
- **`t`** — the primary consumer-facing export. Reads the ambient bound `t` if present, otherwise falls back to `i18next.t`. Typed as `TFunction` via a cast so it can be a drop-in replacement for the global `i18next.t`.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — imports `getDefaultLocale` as the final fallback in `getCurrentLocale()`.
- **`src/infrastructure/i18n/index.ts`** — barrel for the i18n module; re-exports this file's public API.
- **`src/infrastructure/http/middlewares/locale.ts`** — negotiates the incoming request's locale and presumably calls `runWithLocaleContext` (or `runWithLocale`) to bind the per-request `t` before downstream handlers execute.
- **`src/infrastructure/http/validation-messages.ts`**, **`src/app/error-handling.ts`**, **`src/kernel/middlewares/authorizations.ts`**, **`src/infrastructure/http/middlewares/rate-limit.ts`**, **`src/infrastructure/surfaces/create-item-controller.ts`**, **`src/infrastructure/surfaces/create-delete-controller.ts`**, **`src/modules/account/controllers/delete-account-request.ts`**, **`src/modules/account/controllers/delete-account-confirm.ts`**, **`src/modules/account/controllers/delete-session.ts`** — consume the ambient `t` export to produce locale-aware user-facing strings (validation errors, auth rejections, rate-limit notices, confirmation prompts).
- **`db/demo/assemble.ts`** — out-of-band data assembly; likely wraps its work in `runWithLocale` so it still gets a bound `t` despite running outside a request chain.

## Notes

- `t` is a **function reference resolved at call time**, not at import time. Swapping `i18next.t` for this `t` in an import is the entire migration; no other wiring is needed for in-request code.
- The cast on `t` (`as TFunction`) is unavoidable: `TFunction`'s overloads can't be satisfied by a plain arrow, so the type is asserted rather than derived.
- Code that runs **outside** the `runWithLocale` chain (e.g., a top-level `console.log` of a translated string during boot) will silently fall back to the global `i18next.t`, which may be in a different language than intended.
- The module doc references `docs/tools/i18n.md` for the broader design rationale.
