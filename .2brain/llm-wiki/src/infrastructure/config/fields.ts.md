---
source: src/infrastructure/config/fields.ts
sha256: efa58e2b8bf6a04413905efafafe02063bb0aa29f0579e57fe96e8f1d9a8e6e0
generated_at: 2026-10-29T01:58:07.745865+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/fields.ts

## Purpose

Defines the typed field builders (`int`, `decimal`, `flag`, `choice`, `text`, `email`, `timeZone`, `currency`, `secret`, `csv`, `keyRing`, `versionedKeyRing`) that configuration slices use to declare each environment variable. Every field enforces a uniform contract—trim, blank-as-unset, reject (never silently default) a wrong value—and carries optional boot-time presence rules so a developer machine can legitimately leave a secret unset.

## Key elements

- **`Field<T>`** — the interface every builder returns: a Zod `schema`, an optional `Presence` rule, and a `sensitive` flag (value is never echoed in error output).
- **`Presence`** — boot-time-only checks: `minLength`, `placeholder` (must not still equal the `.env-example` stand-in), `minBytes` (minimum decoded key size for cryptographic material), `productionOnly`, and `skipWhen(env)`.
- **`build<T>(inner, options)`** — internal helper that wraps a Zod schema with `blankAsUnset` preprocessing, optional default, and presence/sensitive metadata.
- **`parseBooleanWord(word)`** — decodes a raw string to `true`/`false`/`undefined` using a `Set` lookup (avoids prototype-chain pitfalls of object-key access).
- **`int(options)`** — whole-string base-10 integer; rejects hex, exponents, unit suffixes. Accepts `min`/`max`/`lessThan` bounds and an optional `default`.
- **`decimal(options)`** — whole-string decimal; rejects leading-dot, scientific notation. Same range options as `int`.
- **`flag(options)`** — boolean via `z.stringbool` with `1/true/yes/on` and `0/false/no/off` (case-insensitive).
- **`choice<T>(allowed, options)`** — closed-set string; lower-cases input, rejects anything outside the set. `allowed` may be a function for lazy registries.
- **`TRUTHY_WORDS` / `FALSY_WORDS`** — exported readonly arrays; the canonical vocabulary for boolean env values.
- **`blankAsUnset`** (internal) — trims a string and returns `undefined` for blank; runs before every field's schema.
- **`RangeOptions` / `CommonOptions` / `BuildOptions`** — option interfaces shared across builders (`required`, `sensitive`, `default`, `verbatim`, numeric bounds).

## Relationships

- **`src/infrastructure/config/store.ts`** — this file imports the `Environment` type from `store.ts` (used as the parameter to `Presence.skipWhen`).
- **`src/infrastructure/config/define.ts`** — composes these field builders into a concrete configuration slice definition; each field declared there is one of the builders exported here.
- **`src/infrastructure/security/config.ts`** — consumes the `secret`, `keyRing`, and `versionedKeyRing` builders; the `minBytes` presence rule and `sensitive` flag exist primarily for its credential fields. This file in turn imports `parseVersionedKeyRing` and `VersionedKey` from `../security/versioned-secret`.
- **`src/app/config.ts`** — top-level composition that instantiates slices (each built from fields in this file) and wires them to the runtime store.
- **`src/infrastructure/http/config.ts`**, **`src/infrastructure/observability/config.ts`**, **`src/infrastructure/i18n/config.ts`**, **`src/infrastructure/persistence/config.ts`**, **`src/infrastructure/runtime/config.ts`**, **`src/infrastructure/adapters/config.ts`** — each domain's config module uses the field builders here to declare its variables (e.g., `int` for timeouts, `flag` for feature toggles, `choice` for mode selection).
- **`scenarios/config.ts`** — test scenarios assert on the `Field` objects and `Presence` rules produced by these builders.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — consumes the field metadata (presence, sensitivity) to emit contract documents.

## Notes

- **`verbatim` option** (on `BuildOptions`): skips the `blankAsUnset` preprocessing step entirely. Intended for values whose exact bytes matter (e.g., raw key material). If you add a new builder, decide explicitly whether it should be verbatim.
- **`Set` vs. object for lookups**: `parseBooleanWord` deliberately uses `Set.has` rather than `Object` property access. Do not "simplify" this to a plain object—`'constructor' in {}` is `true` and would produce a false positive for caller-controlled input.
- **`minBytes` is for self-generated keys only**: do not set it on values issued by a third party (e.g., a provider's `whsec_` secret). The comment in `Presence` calls this out explicitly.
- **Presence is boot-time only**: it is never evaluated during per-request reads. A field can be `undefined` at runtime on a dev machine even when `presence` demands a value in production.
- **`default` vs. Zod `.default()`**: the `build` helper uses `.optional().transform(v => v ?? fallback)` rather than Zod's `.default()` because the latter's typing refuses a generic `T`.
- **`skipWhen` must mirror the selector's own field**: the callback receives the raw `Environment` object, so it must parse the controlling variable the same way that variable's own `Field` does—no shortcuts.
