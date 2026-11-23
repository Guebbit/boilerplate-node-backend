---
source: src/modules/locales/services/actions.ts
source_sha256: 4452be9c760670e28826646b4c606f99a3cb007318626bdb9f33972309a75bd7
context_sha256: 984919d9c67299493e21a4b6c1b2d9715d982646a7e345958681ed72909c9e03
generated_at: 2026-11-22T05:46:41.436886+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/actions.ts

## Purpose
Decides what a caller may do to a language, in one place, so no client re-derives the rules. It combines the state half (is the language active, is it the fallback locale) with the caller half (which of the two keys `update:Locale` and `delete:Locale` they hold) in `languageActions`. The presenter only maps the finished block.

## Key elements
- `LanguageStanding`: `{ update, delete }` booleans for the two keys a caller holds.
- `NO_STANDING`: standing with both flags `false`, for a caller who holds neither key.
- `standingOn(caller?)`: builds a standing from `holds(caller, 'update' | 'delete', 'Locale')`. It returns `NO_STANDING` when there is no caller.
- `standingOnRead(scopeOf, caller?)`: the standing for a READ of the manifest. It returns `NO_STANDING` when `hasAnonymousReadScope` is true, and otherwise returns `standingOn(caller)`.
- `NO_ACTIONS`: a `LanguageActions` with every flag `false`. It applies to a language with no registered row, because its deployed file has no off switch.
- `languageActions(language, standing)`: takes the language's `tag` and `active` plus a standing, and returns the `LanguageActions` flags:
  - `update` equals `standing.update`.
  - `activate` requires update rights and an inactive language.
  - `deactivate` requires update rights, an active language, and that the language is not the fallback.
  - `delete` requires delete rights and that the language is not the fallback.
  - `deleteBlocked: LanguageDeleteBlockedReason.fallback` is added only when the caller holds the delete key and the language is the fallback.

## Relationships
- `@kernel/ability` (`src/kernel/ability.ts`): supplies `holds`, used to check the two `Locale` keys.
- `@kernel/access/query` (`src/kernel/access/query.ts`): supplies `hasAnonymousReadScope`, used to decide whether a read gets a standing.
- `@infrastructure/i18n` (`src/infrastructure/i18n/index.ts`): supplies `getFallbackLocale`, which `languageActions` compares against the language tag.
- `@types` (`src/types/index.ts`): supplies `Caller`, `Language`, `LanguageActions` and the `LanguageDeleteBlockedReason` enum.

## Notes
- `standingOnRead` exists because anonymous-scope readers are served from a cache shared with every guest. A non-empty standing there would be served to strangers, so only callers outside that scope (`display:Locale`) get one.
- `deleteBlocked` is deliberately omitted for callers who cannot delete at all, so they are not told why a button is missing.
- `languageActions` calls `getFallbackLocale()` on every call rather than caching the result.
