---
source: src/infrastructure/config/fields.ts
source_sha256: 2931ec317a54204fc17824c389f9f2ae740ec366206d2566a873a623a0d703cf
context_sha256: e481a582e27c6db55ce8937e293b8b39695ec86d4f2ff26e996ad70d0038ac46
generated_at: 2026-11-22T02:44:05.819772+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/fields.ts

## Purpose
Defines the field builders used to write a configuration slice (`int`, `decimal`, `flag`, `choice`, `text`, `email`, `timeZone`, `currency`, `country`, `countries`, `locale`, `locales`, `secret`, `csv`, `keyRing`, `versionedKeyRing`). Every environment variable is read through one parser with one rule: values are trimmed, a blank counts as unset, and a value that is set but wrong is an issue, never a silent fallback. Presence rules (length, placeholder, production-only) are kept as data on the field and checked only at boot.

## Key elements
- `TRUTHY_WORDS` / `FALSY_WORDS`: accepted boolean vocabularies (`1/true/yes/on`, `0/false/no/off`), case-insensitive.
- `parseBooleanWord(word)`: decodes one word to `true`/`false`, or `undefined` if it isn't a boolean word. It uses `Set` lookups so caller-controlled text can't hit inherited `Object.prototype` members.
- `Presence`: boot-time rule with `minLength`, `placeholder`, `minBytes` (minimum decoded key size, hex or base64), `productionOnly`, and `skipWhen(environment)`.
- `Field<T>`: `{ schema: z.ZodType<T>, presence?, sensitive }`. A sensitive field's value is never echoed into error messages.
- `CommonOptions`: `required` (a `Presence`) and `sensitive`.
- `build(inner, options)` (internal): wraps a Zod rule. It runs `blankAsUnset` first, applies `.optional()`, then fills in `default` through a transform. `verbatim` skips the trim and blank step.
- `RangeOptions`: `min`, `max` and `lessThan` bounds for numbers. `rangeLabel` and `boundedNumber` (internal) build the error label and the Zod number rule.
- `int`: whole-string base-10 integers only. `5mb`, `0x10`, `1e3` and `1.5` are refused. Parsed with radix 10.
- `decimal`: whole-string `[+-]digits[.digits]`. `.5` and `1e-1` are refused.
- `flag`: uses `z.stringbool` with the truthy and falsy words, case-insensitive.
- `choice(allowed, options)`: a closed set, lower-cased. `allowed` may be a function, for registries populated late.
- The other builders listed in the module doc (`text`, `email`, `timeZone`, `currency`, `country`, `locale`, `secret`, `csv`, `keyRing`, `versionedKeyRing` and so on) are declared in the part of the file beyond what was visible here.

Most builders are overloaded: passing a `default` makes the result `Field<T>`, and omitting it makes `Field<T | undefined>`.

## Relationships
- Imports `isIso4217Code` from `src/domain-primitives/money.ts` to validate currency codes.
- Imports `canonicalLocale` and `isWellFormedLocale` from `src/infrastructure/i18n/locale-tag.ts` for the locale fields.
- Imports the `Environment` type from `src/infrastructure/config/store.ts`, used by the `skipWhen` option of `Presence`.
- `src/infrastructure/config/define.ts` is the other file in the config layer. It presumably consumes `Field` objects to define slices, though that is not shown here.
- `src/app/config.ts`, `scenarios/config.ts`, and the schema and docs scripts (`scripts/contracts/generate-shared-rule-schemas.ts`, `scripts/docs/document-facts.ts`) are listed as neighbors. The visible part of this file doesn't show how they use these builders.

## Notes
- Presence checks run at boot and are skipped under `NODE_ENV=test`. They are not parse rules, because an unset secret is valid on a developer machine.
- `minBytes` suits operator-generated keys such as `openssl rand -hex 32`. Leave it off for third-party-issued secrets such as a provider's `whsec_` signing secret.
- `build` uses `.optional().transform(...)` rather than `.default()`, because Zod's `.default()` typing refuses a generic `T`.
- `skipWhen` receives the raw environment, so it must read its selector the same way that selector's own field does.
- The module's doc comment points to the "add a variable" section of the configuration operations docs.
