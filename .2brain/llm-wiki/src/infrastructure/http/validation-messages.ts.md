---
source: src/infrastructure/http/validation-messages.ts
sha256: ab7ebb16b8c64a0d5244ef9a037b9d8fd49039baf6fba17535a398453abf56dd
generated_at: 2026-09-23T17:46:29.958215+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/validation-messages.ts

## Purpose

Centralizes Zod parse-error copy so every schema violation—generated or hand-written—is answered in the caller's language via the request-scoped i18n `t`. It registers a single global `customError` map on the Zod singleton, eliminating per-schema message strings and fixing the English fallback that generated schemas (`@api/schemas.zod`) otherwise produced.

## Key elements

- **`sizeKey(bound, origin)`** — Maps a size constraint to the correct i18n key, distinguishing string character counts (`-string`), collection item counts (`-items`), and numeric bounds (`-number`).
- **`NAMED_FORMATS`** — `Set` of format codes (`email`, `url`, `uuid`, `datetime`, `date`, `time`) that receive a dedicated i18n key; everything else falls to the generic format message.
- **`messageFor(issue)`** — Translates one `$ZodIssue` into a localized string. Every branch resolves a `t(...)` key; the `default` case returns the generic `validation.invalid` rather than an untranslated Zod string.
- **`registerValidationMessages()`** *(exported)* — Installs the map via `z.config({ customError: … })`. Must be called explicitly during boot; it is **not** a side effect of importing the module.

## Relationships

- **`src/app.ts`** — Calls `registerValidationMessages()` in the boot sequence, placed adjacent to the i18n mount so the ordering dependency (`t` must resolve before any request is parsed) is visible in one place.
- **`src/infrastructure/i18n/index.ts`** — Provides the `t` function imported as `@infrastructure/i18n`; this file is a consumer of the request-scoped translation context.
- **`src/infrastructure/i18n/context.ts`** — Underlying implementation of the per-request `t` that `messageFor` reads at parse time.
- **`tests/support/setup.ts`** — Presumably invokes `registerValidationMessages()` so integration/e2e tests exercise the same global map.
- **`tests/unit/infrastructure/http/validation-messages.test.ts`** — Unit-tests the `messageFor` branching logic and key resolution.

## Notes

- **Parse-time, not build-time.** The map reads the request-scoped `t` when Zod parses, not when a schema object is constructed. A schema can be defined once and reused across requests in different languages.
- **~17 i18n keys cover all generated schemas.** Keys are per *constraint type* (e.g. `validation.too-small-string`), not per field, which keeps the dictionary small regardless of schema count.
- **Unknown issue codes degrade to `validation.invalid`.** Deliberate trade-off: vague-but-translated over precise-but-English. This covers `.refine()` calls, union mismatches, and any future Zod issue codes.
- **Uses Zod v4 `customError` hook** (`z.config`), not per-schema `.message()` overrides, so no codegen changes are needed.
- **`invalid_type` splits on `input === undefined`** to distinguish "field missing" from "wrong type" — two different user errors with different messages.
