---
source: src/infrastructure/config/fields.ts
sha256: 3c936c85be764a041067d8036ff9cdbe26b7b6b6d0705c9da62a4dd433d3b7d8
generated_at: 2026-11-08T03:25:17.294333+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/fields.ts

## Purpose

Provides the typed field builders (`int`, `decimal`, `flag`, `choice`, `text`, `email`, `timeZone`, `currency`, `country`, `countries`, `secret`, `csv`, `keyRing`, `versionedKeyRing`) that every configuration slice uses to declare how an environment variable is read. Each builder wraps a Zod schema behind a uniform contract: a blank value is unset, a present-but-wrong value is an issue (never a silent fallback), and boot-time presence rules (length, placeholder, production-only) are data on the field rather than parse-time checks.

## Key elements

- **`TRUTHY_WORDS` / `FALSY_WORDS`** – readonly arrays of the six accepted boolean word forms (either case).
- **`parseBooleanWord(word)`** – decodes a single word to `true` / `false` / `undefined`; uses `Set.has` to sidestep prototype-chain pitfalls of object-key lookups.
- **`Presence`** – interface for boot-time presence rules: `minLength`, `placeholder`, `minBytes` (key-strength floor), `productionOnly`, and an optional `skipWhen(env)` guard.
- **`Field<T>`** – the shape every builder returns: a Zod `schema`, an optional `presence` rule, and a `sensitive` flag (value never echoed in errors).
- **`CommonOptions` / `RangeOptions`** – option bags accepted by builders; `RangeOptions` adds `min`, `max`, `lessThan` bounds.
- **`build<T>(inner, options)`** (internal) – assembles a `Field<T>` by composing `z.preprocess` (blank → unset), `.optional().transform()` for defaults, and the `presence` / `sensitive` metadata. Supports a `verbatim` flag that skips the trim-and-blank step.
- **`int(options)`** – whole-number field; strict base-10 regex, then range check via `zod` pipe.
- **`decimal(options)`** – decimal field; whole-string decimal regex (rejects `.5`, `1e-1`), then range check.
- **`flag(options)`** – boolean field built on `z.stringbool` with the shared word lists.
- **`choice<T>(allowed, options)`** – closed-set field; `allowed` may be a lazy `() => T[]` for registries populated at runtime; lower-cases input before membership check.
- **`parseVersionedKeyRing`** (re-exported type `VersionedKey`) – imported from `../security/versioned-secret` to support the `versionedKeyRing` builder.
- **`Environment`** (type import from `./store`) – the parameter type for `Presence.skipWhen`.

## Relationships

- **Imports from** `../security/versioned-secret`: `parseVersionedKeyRing` and the `VersionedKey` type, used by the `versionedKeyRing` builder.
- **Imports from** `./store` (`src/infrastructure/config/store.ts`): the `Environment` type consumed by `Presence.skipWhen`.
- **Consumed by** the config-slice files across infrastructure subdirectories (`src/infrastructure/adapters/config.ts`, `src/infrastructure/http/config.ts`, `src/infrastructure/i18n/config.ts`, `src/infrastructure/observability/config.ts`, `src/infrastructure/persistence/config.ts`, `src/infrastructure/runtime/config.ts`, `src/infrastructure/security/config.ts`) and by `src/infrastructure/config/define.ts`, which compose these builders into concrete slice definitions.
- **Consumed by** `scenarios/config.ts`, `src/app/config.ts`, and `scripts/contracts/generate-shared-rule-schemas.ts` for scenario, application, and schema-generation configuration respectively.

## Notes

- **Prototype-chain safety:** `parseBooleanWord` deliberately uses `Set.has` instead of `'key' in obj` or bracket access, because a caller-controlled string like `"constructor"` would resolve to an inherited `Object.prototype` property.
- **Blank ≠ zero:** `blankAsUnset` runs before every field's own Zod rule. An empty or whitespace-only env value is treated exactly as if the variable were absent, so a `default` (if given) fills in.
- **Presence is boot-time, not read-time:** a developer machine may legitimately leave a secret unset; `minLength`, `placeholder`, and `minBytes` are enforced only at boot and are skipped under `NODE_ENV=test`.
- **`minBytes` rationale:** guards against weak HS256/HKDF keys (RFC 7518 §3.2, RFC 5869). Intentionally omitted for third-party-issued secrets (e.g. a provider `whsec_` key) whose strength is out of the operator's control.
- **Zod `default` workaround:** `build` uses `.optional().transform(v => v ?? fallback)` rather than `.default()` because Zod's `.default()` typing does not accept a generic `T`.
- **`verbatim` option:** available on `BuildOptions` to skip `blankAsUnset`; intended for values whose exact byte content is meaningful (e.g. raw tokens).
- **`choice` lazy mode:** passing a function instead of an array defers membership resolution, supporting registries whose members are only known after providers register at runtime.
