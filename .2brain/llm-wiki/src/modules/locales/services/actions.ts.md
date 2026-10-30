---
source: src/modules/locales/services/actions.ts
sha256: 4452be9c760670e28826646b4c606f99a3cb007318626bdb9f33972309a75bd7
generated_at: 2026-10-29T04:22:44.898166+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/actions.ts

## Purpose

Centralizes the decision of *what a caller may do to a language* (update, activate, deactivate, delete) in one place, combining the language's runtime state (active? fallback?) with the caller's key holding (standing). This keeps the permission rules out of every client/presenter, which only maps the finished `LanguageActions` block.

## Key elements

- **`LanguageStanding`** (interface) — Two booleans (`update`, `delete`) indicating which of the two locale keys the caller holds.
- **`NO_STANDING`** (const) — Both flags `false`; the standing of a caller who holds neither key.
- **`standingOn(caller?)`** — Derives `LanguageStanding` from a `Caller` by asking `holds()` for `update:Locale` and `delete:Locale`. Returns `NO_STANDING` for `undefined`.
- **`standingOnRead(scopeOf, caller?)`** — Standing for a READ of the manifest. Returns `NO_STANDING` when the caller's read scope is the anonymous one (to avoid caching a personalized flag block served to all guests); otherwise delegates to `standingOn`.
- **`NO_ACTIONS`** (const) — All-false `LanguageActions`; used for a language tag that has no registered row (deployed file with no off switch).
- **`languageActions(language, standing)`** — The main entry point. Takes `{ tag, active }` plus a `LanguageStanding` and returns the full `LanguageActions` object. Falls back-locale check to `getFallbackLocale()`. Conditionally attaches `deleteBlocked: LanguageDeleteBlockedReason.fallback` only when the caller *does* hold the delete key but the target is the fallback.

## Relationships

- **`src/kernel/ability.ts`** — Imports `holds` to test whether a caller carries a given key.
- **`src/kernel/access/query.ts`** — Imports `hasAnonymousReadScope` to detect the anonymous read scope in `standingOnRead`.
- **`src/infrastructure/i18n/index.ts`** — Import source for `getFallbackLocale` (barrel re-export).
- **`src/infrastructure/i18n/catalog.ts`** — Upstream definition of `getFallbackLocale` re-exported through the i18n barrel.
- **`src/types/index.ts`** — Source of the `Caller`, `Language`, `LanguageActions`, and `LanguageDeleteBlockedReason` type definitions.
- **`src/types/auth-context.ts`** — Upstream definition of `Caller` re-exported through the types barrel.
- **`src/modules/locales/services/index.ts`** — Barrel that re-exports this module alongside its sibling services.

## Notes

- `standingOnRead` exists to prevent a cache-leak: if an anonymous-scope caller's standing were computed and stored in the shared read cache, every subsequent guest would receive that caller's flags. Only callers outside the anonymous scope (`display:Locale`) get a real standing on READ.
- `deleteBlocked` is deliberately *omitted* (not set to a value) when the caller lacks the delete key entirely — a caller who can't delete at all is not told why the button is missing.
- `activate` is only possible when the language is currently inactive; `deactivate` is only possible when active *and* not the fallback. These are derived, not independent flags.
- `NO_ACTIONS` is distinct from `NO_STANDING`: the former is a full `LanguageActions` for an unregistered language; the latter is the caller-side input.
