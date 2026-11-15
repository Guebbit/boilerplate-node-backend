---
source: src/infrastructure/config/fields.ts
sha256: f180d7a5f10ff8349e1044d8ce5e4494b64be5099a3a0d758089147510230885
generated_at: 2026-11-14T17:56:25.444046+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/fields.ts

## Purpose

Field builders for declaring configuration variables. Each builder (`int`, `decimal`, `flag`, `choice`, `text`, `email`, `timeZone`, `currency`, `country`, `countries`, `locale`, `locales`, `secret`, `csv`, `keyRing`, `versionedKeyRing`) returns a `Field<T>` that pairs a Zod parse rule with an optional boot-time `Presence` check. Every builder enforces the same invariant: a blank string is treated as unset, and a set-but-malformed value is a hard error—never a silent fallback.

## Key elements

- **`Field<T>`** — the shape every builder returns: a Zod `schema`, an optional `Presence` rule, and a `sensitive` flag (suppresses the value in error messages).
- **`Presence`** — boot-time-only constraints: `minLength`, `placeholder` (must not still equal the `.env-example` value), `minBytes` (minimum decoded key size for HMAC/HKDF keys), `productionOnly`, and `skipWhen(env)` for conditional requirements.
- **`build<T>`** — internal factory that wraps a Zod rule with `z.preprocess(blankAsUnset, …)` and `.optional().transform(…)` so a `default` fills in for unset values. Accepts a `verbatim` flag to skip trimming.
- **`int` / `decimal`** — whole-string regex gates (`/^[+-]?\d+$/`, `/^[+-]?\d+(\.\d+)?$/`) then range checks via `boundedNumber`. Refuses hex, exponents, unit suffixes.
- **`flag`** — maps a fixed vocabulary (`1/true/yes/on`, `0/false/no/off`, case-insensitive) to a boolean via `z.stringbool`.
- **`choice<const T>`** — lower-cases the input and checks membership against a static array or a lazy `() => T[]` function (for registries populated at runtime).
- **`parseBooleanWord`** / **`TRUTHY_WORDS`** / **`FALSY_WORDS`** — exported for reuse outside the builder (e.g., query-string or form parsing). Uses `Set.has` deliberately to avoid prototype-chain lookups.
- **`RangeOptions`** / **`CommonOptions`** — shared option shapes passed to builders.

## Relationships

- **`src/infrastructure/config/store.ts`** — provides the `Environment` type imported here; `Presence.skipWhen` accepts an `Environment` argument so a rule can be waived conditionally based on the current environment.
- **`src/infrastructure/config/define.ts`** — the slice-defining layer that consumes these builders to declare named config objects.
- **`src/domain-primitives/money.ts`** — provides `isIso4217Code`, used by the `currency` builder to validate ISO-4217 codes.
- **`src/infrastructure/i18n/locale-tag.ts`** — provides `canonicalLocale` and `isWellFormedLocale`, used by the `locale` / `locales` builders.
- **`src/app/config.ts`**, **`src/infrastructure/http/config.ts`**, **`src/infrastructure/i18n/config.ts`**, **`scenarios/config.ts`**, **`src/infrastructure/adapters/config.ts`** — downstream config slices that call these builders to declare their variables.
- **`scripts/docs/document-facts.ts`** — inspects field metadata (labels, presence rules) to generate documentation.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — consumes field schemas to emit shared contract artifacts.

## Notes

- **`Set` over object for word lookup:** `parseBooleanWord` uses `Set.has` rather than `'word' in obj` or `obj[word]` because a plain object's prototype chain would make `'constructor' in {}` return `true`. This is a deliberate prototype-pollution guard for caller-controlled input.
- **`parseInt(text, 10)`** is used explicitly so a zero-padded string like `"0900"` is not parsed as octal.
- **`.optional().transform(v => v ?? default)`** is used instead of Zod's `.default()` because `.default()`'s typing does not accept a generic `T` (see Zod API notes).
- **`verbatim: true`** on a builder option skips the `blankAsUnset` preprocessing entirely—meant for values whose exact bytes matter (e.g., a base64 secret that may legitimately contain leading/trailing whitespace as part of the encoding).
- **Presence checks never run on every read.** They are boot-time-only, gated by `NODE_ENV`, so a developer can leave a secret unset without a per-request penalty.
- The file is truncated in the source above; the remaining builders (`text`, `email`, `timeZone`, `currency`, `country`, `countries`, `locale`, `locales`, `secret`, `csv`, `keyRing`, `versionedKeyRing`) follow the same `build(…)` pattern.
