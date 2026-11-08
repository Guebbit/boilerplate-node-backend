---
source: src/infrastructure/http/validation-messages.ts
sha256: 05b2a3dbd74299d60f2ac7c3f52dd35aa4155b21c379e777004beba2408468ce
generated_at: 2026-11-08T03:35:32.640307+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/validation-messages.ts

## Purpose

Global Zod error-message map that replaces Zod's default English refusals with translated sentences in the caller's language. Because generated schemas (`@api/schemas.zod`) carry no per-field messages, this single hook fixes every schema without touching codegen. It activates at **parse time** (not construction time) so it can read the request-scoped `t` from i18n.

## Key elements

- **`attributeOf(path)`** (exported) — Resolves the human-facing name of a field by walking the Zod issue path from the innermost segment outward. Returns the first segment with a `validation.attributes.*` translation; falls back to `validation.attribute-fallback` ("This field").
- **`registerValidationMessages()`** (exported) — Installs the message map on the Zod singleton via `z.config({ customError })`. Must be called after i18n is mounted.
- **`messageFor(issue)`** (internal) — Maps a single `$ZodIssue` to a translated sentence. Switches on `issue.code` (`invalid_type`, `too_small`, `too_big`, `invalid_format`, `not_multiple_of`, `unrecognized_keys`, `invalid_value`); unknown codes fall through to the generic `validation.invalid`.
- **`sizeKey(bound, issue, limit)`** (internal) — Picks the correct dictionary key for size constraints, distinguishing string/number/items units and special-casing `limit === 1` and exclusive bounds.
- **`TYPE_WORDS`** / **`NAMED_FORMATS`** — Lookup tables mapping Zod's `expected` tokens and format names to their dictionary counterparts.

## Relationships

- **`src/app.ts`** — Calls `registerValidationMessages()` during boot, ordered after the i18n mount so `t` can resolve keys by the time a request is parsed.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Provides the `t` function (imported as `@infrastructure/i18n`) that all message resolution goes through.
- **`tests/support/setup.ts`** — Registers the error map in the test harness so unit/integration tests see translated messages.
- **`tests/unit/infrastructure/http/validation-messages.test.ts`** — Exercises `attributeOf` and the `messageFor` branches (invoked via `registerValidationMessages` + a parse).

## Notes

- **Parse-time, not import-time.** `registerValidationMessages` is deliberately called in the boot sequence rather than as an import side-effect, making the dependency on i18n ordering explicit in `app.ts`.
- **`attributeOf` walks from the end.** For nested paths like `items.0.productId`, the innermost *labelled* segment wins; numeric indexes and unlabelled segments are skipped. The `FIELD_NAME` regex (`/^[A-Za-z][\w-]*$/`) filters out numeric indexes and dotted locale-like keys.
- **`NO_LABEL` sentinel.** Uses the null-byte string `'\u0000no-label'` to guarantee no real translation can collide with the "no label found" signal.
- **No English leak.** Every branch in `messageFor` resolves a `t(...)` key; the `default` case returns `validation.invalid` so an unrecognised issue code still yields a translated (if vague) sentence rather than Zod's built-in English.
- **String min = 1 special case.** A `string` with `.min(1)` (inclusive) maps to `validation.filled` ("must not be empty") rather than "at least 1 characters".
