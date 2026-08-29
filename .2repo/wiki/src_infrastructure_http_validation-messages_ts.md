# src/infrastructure/http/validation-messages.ts

## Purpose

Centralizes Zod validation error messages so that every schema in the process—generated (`@api/schemas.zod`) or hand-written—returns a translated refusal in the caller's language. It exists because, without it, generated schemas fell back to Zod's built-in English while hand-written schemas used Italian, producing inconsistent 422 copy depending on the endpoint.

## Key elements

- **`registerValidationMessages()`** (exported) — Installs a `customError` handler on Zod's global config via `z.config()`. Called once from the boot sequence.
- **`messageFor(issue: $ZodIssue): string`** — Maps a single Zod issue to a `t(…)` call. Covers `invalid_type`, `too_small`, `too_big`, `invalid_format`, `not_multiple_of`, `unrecognized_keys`, `invalid_value`; everything else falls to the generic `validation.invalid`.
- **`sizeKey(bound, origin): string`** — Picks the correct dictionary key for min/max constraints based on what is being sized (string chars, array/set/file items, number value).
- **`NAMED_FORMATS`** — A `Set` of format strings (`email`, `url`, `uuid`, `datetime`, `date`, `time`) that get a dedicated sentence; all other formats use `validation.invalid-format`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Provides the `t` function imported at the top of this file; every resolved message goes through it.
- **`src/infrastructure/i18n/context.ts`** — Supplies the request-scoped `t` binding. Because `customError` runs at *parse* time (not schema-construction time), it reads the active request's `t`, so concurrent requests in different languages cannot cross-contaminate.
- **`src/app.ts`** — Calls `registerValidationMessages()` during the boot sequence, making the dependency on i18n being mounted visible in the startup order.
- **`tests/support/setup.ts`** — Invokes `registerValidationMessages()` so that tests exercising request parsing receive translated messages rather than Zod defaults.

## Notes

- Keys are per **constraint type** (~17 total), not per field. A per-field key would require one dictionary entry per generated shape (511+).
- Precedence is preserved: any field that already declares its own `t(…)` message (e.g. `zodUserSchema`) wins; this global map is the fallback that answers everywhere no specific copy exists.
- The `z.config()` call mutates a process-wide singleton. It must be called before any request is parsed, which is why the call is explicit in `app.ts` rather than a side-effect at import time.
- The `default` branch in `messageFor` guarantees no issue code can silently fall through to Zod's English string—unknown codes get the generic (but translated) `validation.invalid`.
