# src/infrastructure/i18n/context.ts

## Purpose

Solves the concurrency bug inherent in `i18next`'s single global instance: two overlapping requests in different languages would otherwise clobber each other's translations. It provides a request-scoped `t` (bound to one locale via `i18next.getFixedT`) propagated through an `AsyncLocalStorage`, so each request's async chain sees only its own language without touching any global.

## Key elements

- **`LocaleContext`** — interface carrying `locale: string` and a `t: TFunction` bound to that locale.
- **`localeStorage`** — the `AsyncLocalStorage<LocaleContext>` instance (module-private); the transport for the ambient locale.
- **`translator(locale)`** — wraps `i18next.getFixedT(locale)`. Pure; no global, no ambient store. The primitive to use when the locale is known but the caller is off the request chain (e.g. building an email in the recipient's language).
- **`createLocaleContext(locale)`** — assembles a `LocaleContext` from a locale string.
- **`runWithLocaleContext(context, cb)`** — executes `cb` (and everything it awaits) inside the ALS scope.
- **`runWithLocale(locale, cb)`** — convenience wrapper for out-of-band work (queue workers, jobs, tests) that has a locale string rather than a full context.
- **`getLocaleContext()`** — returns the ambient `LocaleContext` or `undefined` when outside a request.
- **`getCurrentLocale()`** — resolves the active locale: ALS store → `i18next.language` → `getDefaultLocale()`.
- **`t`** — ambient translation function. Reads the request's bound `t` from the ALS store, falls back to `i18next.t`. Cast to `TFunction` because the union-of-overloads type cannot be satisfied structurally by an arrow.

## Relationships

- **`./catalog.ts`** — imports `getDefaultLocale` as the final fallback in `getCurrentLocale()`.
- **`./index.ts`** — barrel file; re-exports this module's public API to the rest of the codebase.
- **`src/infrastructure/http/middlewares/locale.ts`** — the entry point that establishes the per-request locale (presumably calls `createLocaleContext` / `runWithLocaleContext` to seed the ALS for the request chain).
- **Controllers & handlers** (`delete-account-confirm.ts`, `delete-account-request.ts`, `delete-session.ts`, `post-logout.ts`, `delete-controller.ts`, `error-handling.ts`, `authorizations.ts`, `security.ts`, `validation-messages.ts`) — consume the ambient `t` (or `getCurrentLocale`) to produce localized user-facing strings.
- **`src/infrastructure/adapters/storage.ts`** / **`db/demo/assemble.ts`** — out-of-band callers that must use `runWithLocale` (or `translator`) because they execute outside the request's async chain.

## Notes

- **ALS is call-chain-scoped.** Anything scheduled outside the current async chain (queue consumers, boot-time callbacks, `setTimeout` callbacks in other tick contexts) will see `undefined` from `getLocaleContext()`. Such code must call `runWithLocale` explicitly with the locale it carries in its payload.
- **`t` cast is unavoidable.** `TFunction` is a union of overloads; no single arrow can satisfy it structurally. The cast is safe because arguments are forwarded untouched to either the bound or global `t`.
- **Prefer `translator` over the ambient `t` in leaf utilities** (e.g. message builders) so the function remains locale-explicit and testable without mocking ALS.
