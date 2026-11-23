---
source: src/infrastructure/http/validation-messages.ts
source_sha256: c531dd8aa3c34c0957e7eace3bcfda0a3a8d7ff50c2c7387cff71446bf5b546c
context_sha256: a492865deb8df3e4c4376886e1b8fe7947c4c1144ce57ad655955f99b06b0388
generated_at: 2026-11-22T02:54:51.837741+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/validation-messages.ts

## Purpose
Provides a single place for validation copy. It installs a global Zod error map that turns every Zod issue into a translated sentence in the caller's language. Generated schemas (`@api/schemas.zod`) carry no messages of their own, so this file localizes them without touching codegen. The map runs at parse time, so it reads the request-scoped `t`.

## Key elements
- `attributeOf(path)`: resolves the human-readable field name for an issue. It walks the path from the end and returns the first string segment that matches `FIELD_NAME` and has a `validation.attributes.<segment>` label. Numeric indexes and unlabelled segments are skipped. If nothing is labelled, it returns `validation.attribute-fallback` ("This field"), so a raw property name never reaches a user.
- `registerValidationMessages()`: calls `z.config({ customError })` to install the map on the Zod singleton.
- `messageFor(issue)` (internal): switches on `issue.code` and resolves a `validation.*` key:
  - `invalid_type`: `required` when the input is `undefined`, otherwise `type-<word>`, with the word taken from `TYPE_WORDS` and falling back to `other`.
  - `too_small` / `too_big`: use `sizeKey`. A string with a minimum of 1 (inclusive) becomes `filled`.
  - `invalid_format`: `format-<name>` for `email`, `url`, `uuid`, `datetime`, `date` and `time`, otherwise `invalid-format`.
  - `not_multiple_of`, `unrecognized_keys` and `invalid_value`: each has its own key.
  - Any other code: the generic `validation.invalid`.
- `sizeKey` (internal): picks the dictionary key from the unit being sized (`string`, `items` for array/set/file, or `number`). A limit of exactly 1 adds `-one`, and an exclusive number bound adds `-exclusive`.
- `TYPE_WORDS` and `NAMED_FORMATS`: lookup tables that map Zod tokens to dictionary words.

## Relationships
- `src/infrastructure/i18n/index.ts` supplies the `t` function that every message goes through. `src/infrastructure/i18n/context.ts` is the request-scoped language context that `t` relies on.
- `src/app/process-boot.ts` is expected to call `registerValidationMessages()`. The boot sequence is where the ordering against the i18n mount is made visible.
- `tests/unit/infrastructure/http/validation-messages.test.ts` is the unit test for this module. `tests/support/setup.ts` is test setup.
- `src/infrastructure/http/ids.ts` and `src/infrastructure/adapters/antibot-providers/altcha.ts` are graph neighbors, but this file shows no direct interaction with them.

## Notes
- Registration is deliberately not an import side effect. It must be called explicitly after i18n is mounted, so `t` can resolve keys by the time a request is parsed.
- Keys are per constraint, not per field. Messages name the field through the `{{attribute}}` placeholder (Laravel's `:attribute`).
- `unrecognized_keys` passes only `keys`, not `attribute`.
- Unmapped issue codes, such as a union mismatch or a bare `.refine()`, get the vague but translated `validation.invalid`. The file prefers this to precise English.
- `FIELD_NAME` (letter first, then word characters or hyphens) excludes indexes and dotted, locale-like keys from label lookup.
- `NO_LABEL` (`'\0no-label'`) is passed to `t` as `defaultValue` to detect a missing label.
