# src/infrastructure/http/validation-messages.ts

## Purpose

Centralises Zod validation error messages so that every schema—generated or hand-written—returns a localised, human-readable string in the caller's language instead of Zod's default English. It achieves this via a single global `customError` hook rather than annotating each schema, meaning codegen output needs no per-field message properties.

## Key elements

- **`registerValidationMessages()`** *(sole export)* — Installs the global error map on the Zod singleton by calling `z.config({ customError })`. Must be invoked explicitly during app boot; it is not a side-effect of importing this module.
- **`messageFor(issue: $ZodIssue): string`** — Maps a single Zod v4 issue to a translated sentence. Every code branch resolves to an i18n key; the `default` case returns the generic `validation.invalid` key so no path falls through to untranslated English.
- **`sizeKey(bound, origin): string`** — Selects the correct i18n key for `too_small` / `too_big` based on the type being constrained (string → characters, array/set/file → items, number → value), producing three distinct sentences.
- **`NAMED_FORMATS`** — A `Set` of format names (`email`, `url`, `uuid`, `datetime`, `date`, `time`) that receive dedicated messages; anything else gets the generic `validation.invalid-format` key.

## Relationships

- **`src/app.ts`** — Calls `registerValidationMessages()` in the boot sequence, immediately after the i18n layer is mounted, making the dependency ordering explicit.
- **`src/infrastructure/i18n/index.ts`** — Source of the `t` import; re-exports the translation function used by `messageFor`.
- **`src/infrastructure/i18n/context.ts`** — Provides the request-scoped language context that `t` resolves at parse time, so the correct locale is read per-request rather than fixed at construction.
- **`tests/support/setup.ts`** — Invokes `registerValidationMessages()` so integration tests exercise the same translated error paths.

## Notes

- Executes at **parse time**, not schema-construction time, which is why it can safely read the request-scoped `t`.
- Roughly 17 i18n keys cover every issue shape produced by the generated schemas (`@api/schemas.zod`); no per-field keys are needed.
- Unrecognised issue codes (e.g. a bare `.refine()` with no message, union mismatches) deliberately degrade to the generic `validation.invalid` key—translated but vague is preferred over precise-but-in-the-wrong-language.
- The file imports `$ZodIssue` from `zod/v4/core`, tying it to Zod v4's internal issue type rather than the public `z.ZodIssue`.
