---
source: src/infrastructure/http/validation-messages.ts
sha256: ab964945ec08ed9e4e4a2ff290439822b7d270025ddf1ff11235d29398d19980
generated_at: 2026-11-14T18:07:12.876163+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/validation-messages.ts

## Purpose

Centralises every Zod validation error message into i18n-translated copy so that both generated and hand-written schemas speak the caller's language. Instead of annotating each schema individually, it installs a single global `customError` hook on the Zod singleton, mapping each issue code to a dictionary key resolved at parse time via the request-scoped translation function.

## Key elements

- **`attributeOf(path)`** (exported) — Resolves a human-readable field label by walking the Zod issue path from the innermost segment outward, skipping numeric indexes and unlabelled segments. Falls back to `validation.attribute-fallback` if no segment has a translation key.
- **`registerValidationMessages()`** (exported) — Calls `z.config({ customError })` to install the global message resolver. Must be invoked during app boot (not at import) so that `t` is guaranteed to be available by parse time.
- **`messageFor(issue)`** (internal) — The per-issue dispatcher. Handles `invalid_type`, `too_small`, `too_big`, `invalid_format`, `not_multiple_of`, `unrecognized_keys`, `invalid_value`, and a `default` fallback (`validation.invalid`).
- **`sizeKey(bound, issue, limit)`** (internal) — Picks the correct dictionary key for length/size constraints, distinguishing string (characters), array/set/file (items), and number units, plus exclusive-bound and bound-of-1 variants.
- **`FIELD_NAME`** — Regex gate that ensures only letter-initial, word/hyphen segments are treated as field names (excludes array indexes and dotted locale keys).
- **`NO_LABEL`** — Sentinel (`\u0000no-label`) used to detect "no translation key found" without colliding with a real label value.
- **`TYPE_WORDS`**, **`NAMED_FORMATS`** — Lookup maps that translate Zod's internal tokens into dictionary-key vocabulary.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Source of the `t` translation function; this file calls it for every message and attribute resolution.
- **`src/app.ts`** — Boot sequence that calls `registerValidationMessages()` after the i18n context is mounted, ensuring `t` can resolve keys before any request is parsed.
- **`tests/unit/infrastructure/http/validation-messages.test.ts`** — Unit tests covering `attributeOf` and the message-resolution branches.
- **`tests/support/setup.ts`** — Test harness that provides the i18n context needed for `t` to work in the test environment.

## Notes

- **Parse-time, not construction-time.** The handler reads the request-scoped `t`, so it cannot run at schema-build time. The install must happen after the i18n middleware is mounted.
- **Ordering dependency.** `registerValidationMessages` must be called *after* the i18n context is available. The call site in `app.ts` is deliberate to keep this ordering visible rather than hiding it in a side-effect import.
- **`unrecognized_keys` is the only branch that omits `attribute`.** The message enumerates the offending keys instead; there is no single field to name.
- **Unknown issue codes never produce English.** The `default` branch returns a (translated) generic `validation.invalid` rather than letting Zod's built-in English message leak through.
- **String min-length of 1 with inclusive bound** maps to `validation.filled` ("must not be empty"), not a generic "at least 1 characters" — a deliberate UX choice.
