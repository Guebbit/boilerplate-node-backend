---
source: src/infrastructure/http/validation-messages.ts
sha256: 05b2a3dbd74299d60f2ac7c3f52dd35aa4155b21c379e777004beba2408468ce
generated_at: 2026-10-14T08:01:58.778037+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/validation-messages.ts

## Purpose

Provides a single, language-aware error-message layer for all Zod validation failures. Generated schemas (`@api/schemas.zod`) ship without messages and would otherwise fall back to Zod's English defaults; this file installs a global `customError` hook that translates every issue into the caller's language at parse time, without requiring per-schema annotations.

## Key elements

- **`attributeOf(path)`** — Walks a Zod issue path from the innermost segment outward, returning the first segment that has a label in the `validation.attributes.*` dictionary. Falls back to `validation.attribute-fallback` ("This field") so a raw property name never reaches the user.
- **`registerValidationMessages()`** — Calls `z.config({ customError: … })` to install the global message hook on the Zod singleton. Must be invoked after i18n is mounted.
- **`messageFor(issue)`** *(internal)* — Maps a single `$ZodIssue` to a translated string by resolving a dictionary key per issue code (`invalid_type`, `too_small`, `too_big`, `invalid_format`, `not_multiple_of`, `unrecognized_keys`, `invalid_value`, or a generic `validation.invalid` fallback).
- **`sizeKey(bound, issue, limit)`** *(internal)* — Picks the correct dictionary key for size constraints, distinguishing string/number/array units and handling the singular (`-one`) and exclusive-bound variants.
- **`TYPE_WORDS`** *(internal)* — Maps Zod `expected` type tokens (`int`, `record`, `set`, …) to the dictionary's type words.
- **`NAMED_FORMATS`** *(internal)* — Set of format codes (`email`, `url`, `uuid`, etc.) that get a dedicated message; everything else gets the generic `validation.invalid-format`.
- **`FIELD_NAME`** — Regex identifying a valid field-name segment (letter then word-chars/hyphens), used to skip numeric indexes and locale keys.
- **`NO_LABEL`** — Sentinel (`\u0000no-label`) that can never collide with a real label string.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Supplies the `t()` function that `attributeOf` and `messageFor` call to resolve dictionary keys.
- **`src/infrastructure/i18n/context.ts`** — Provides the request-scoped locale context that `t` reads; this file depends on that context being active by the time a request is parsed.
- **`src/app.ts`** — Calls `registerValidationMessages()` in the boot sequence, after the i18n mount, making the dependency ordering explicit.
- **`tests/unit/infrastructure/http/validation-messages.test.ts`** — Unit-tests `attributeOf` and the exported registration function.
- **`tests/support/setup.ts`** — Configures the i18n context fixture so `t` resolves keys in tests.

## Notes

- **Parse-time, not construction-time.** `t` is called inside the `customError` callback, so the message is resolved per-request with the active locale. This is why registration is deferred to boot rather than executed at import.
- **No fall-through to Zod English.** Every branch in `messageFor` resolves a dictionary key; unknown codes hit the generic `validation.invalid` rather than leaking Zod's default strings.
- **`issue.path` can be `undefined`.** Zod's types mark it as always present, but raw top-level issues reaching the global hook may lack it—hence the `?? []` guard and the eslint-disable.
- **Sentinel trick.** `NO_LABEL` uses a NUL byte prefix so no real label string can equal it, avoiding a false positive when checking "did a label exist?"
- **Field naming convention.** Dictionary keys are per *constraint* (e.g. `validation.too-small-string-one`), not per field. The field name is injected as `{{attribute}}` (Laravel `:attribute` style) and resolved at call time by `attributeOf`.
