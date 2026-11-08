---
source: src/modules/locales/services/actions.ts
sha256: 4452be9c760670e28826646b4c606f99a3cb007318626bdb9f33972309a75bd7
generated_at: 2026-11-08T06:24:39.805312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/actions.ts

## Purpose

Centralizes the rules for what a caller may do to a registered language (update, activate, deactivate, delete). It combines the language's state (active, fallback) with the caller's permission keys into a single `LanguageActions` block so that presenters render flags without re-deriving the policy.

## Key elements

- **`LanguageStanding`** (interface) — two booleans: whether the caller holds `update:Locale` and `delete:Locale`.
- **`NO_STANDING`** (const) — both flags `false`; the standing for an unauthenticated or keyless caller.
- **`standingOn(caller?)`** — maps a `Caller` to a `LanguageStanding` by calling `holds()` for each key.
- **`standingOnRead(scopeOf, caller?)`** — returns `NO_STANDING` when the caller sits inside the anonymous read scope (cache-shared with guests), otherwise delegates to `standingOn`.
- **`NO_ACTIONS`** (const) — all-false `LanguageActions`; used for languages that have no registered row (deployed-only files).
- **`languageActions(language, standing)`** — the main entry point. Given a language's `tag`/`active` and the caller's standing, returns the full `LanguageActions` block. Conditionally includes a `deleteBlocked: 'fallback'` reason when the caller has delete standing but the language is the fallback.

## Relationships

- **`src/kernel/ability.ts`** — imports `holds()` to test whether a caller carries a specific key.
- **`src/kernel/access/query.ts`** — imports `hasAnonymousReadScope()` to detect the anonymous-read path in `standingOnRead`.
- **`src/infrastructure/i18n/index.ts`** → **`src/infrastructure/i18n/catalog.ts`** — imports `getFallbackLocale()` to identify the fallback language tag.
- **`src/types/index.ts`** → **`src/types/auth-context.ts`** — imports the `Caller`, `Language`, `LanguageActions`, and `LanguageDeleteBlockedReason` types.
- **`src/modules/locales/services/index.ts`** — barrel file that re-exports this module's public API to the rest of the locales service layer.

## Notes

- `deleteBlocked` is added via a conditional spread, so the key is **absent** (not `undefined`) when the caller lacks delete standing or the language is not the fallback. Consumers should guard with `'deleteBlocked' in actions` rather than reading it unconditionally.
- `standingOnRead` exists to prevent per-caller action flags from leaking into the shared anonymous cache: any caller whose read scope is the anonymous one gets `NO_STANDING` regardless of actual keys.
- `NO_ACTIONS` is a module-level constant (not a function) intended for the "no registered row" path; it is not derived from any caller context.
