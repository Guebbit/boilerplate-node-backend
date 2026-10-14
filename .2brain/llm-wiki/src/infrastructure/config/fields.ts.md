---
source: src/infrastructure/config/fields.ts
sha256: 52adbcb11041359fdd01648805c1d9cd9cd419ca7edc559a1eb300c2ba44426d
generated_at: 2026-10-14T07:51:37.688429+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/fields.ts

## Purpose

Defines the typed field builders (`int`, `decimal`, `flag`, `choice`, `text`, `email`, `timeZone`, `secret`, `csv`, `keyRing`, `versionedKeyRing`) used to declare configuration slices. Every builder enforces a single contract: blank strings are unset, a set-but-invalid value is an error (never a silent fallback), and presence requirements (min length, placeholder rejection, key strength) are boot-time checks separate from shape validation.

## Key elements

- **`Field<T>`** — interface pairing a Zod `schema` with an optional `presence` rule and a `sensitive` flag (controls whether the value is masked in error output).
- **`Presence`** — boot-time rule: `minLength`, `placeholder`, `minBytes` (decoded key-size floor for HS256/HKDF keys), `productionOnly`, `skipWhen(env)`.
- **`build<T>()`** — internal wrapper that composes `z.preprocess(blankAsUnset, …)` with an optional default, producing a `Field`.
- **`int(options)`** — whole-string base-10 integer; rejects hex, unit suffixes, and `1e3`. Supports `min`/`max` bounds.
- **`decimal(options)`** — whole-string decimal; rejects `.5` and `1e-1`. Supports `min`/`max`/`lessThan`.
- **`flag(options)`** — maps `TRUTHY_WORDS`/`FALSY_WORDS` (case-insensitive) to `boolean`.
- **`choice<T>(allowed, options)`** — closed-set membership (lower-cased); `allowed` may be a lazy function for late-registered providers.
- **`text(options)`** — free text with optional `case: 'lower' | 'upper'` normalisation and a `verbatim` escape hatch that skips trimming.
- **`blankAsUnset`** — the shared preprocess: trims, maps `""` → `undefined`.
- **`rangeLabel` / `boundedNumber`** — helpers that turn `min`/`max`/`lessThan` into a human-readable label and a chained Zod number rule.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — imports `FALSY_WORDS` and `TRUTHY_WORDS`, the canonical word lists consumed by `flag()`.
- **`src/infrastructure/security/versioned-secret.ts`** — imports `parseVersionedKeyRing` and the `VersionedKey` type, used by the `versionedKeyRing` builder (and likely `keyRing`).
- **`src/infrastructure/config/store.ts`** — imports the `Environment` type, which is the argument type of `Presence.skipWhen`.
- **`src/infrastructure/config/define.ts`** — the slice-definition layer that calls these builders to compose a full config object.
- **Domain config slices** (`src/infrastructure/{adapters,http,i18n,observability,persistence,runtime,security}/config.ts`, `src/app/config.ts`, `scenarios/config.ts`) — each declares its variables using the builders exported here.
- **`src/infrastructure/adapters/export-store.ts`**, **`src/infrastructure/http/read-capped-body.ts`**, **`scenarios/flows/shop-history.ts`** — downstream consumers that read config values produced by the slices built on these fields.

## Notes

- A value that is *set and wrong* is always an ISSUE; the old `environmentNumber(key, fallback)` silent-fallback pattern is deliberately gone.
- `Presence` rules run only at boot and are skipped when `NODE_ENV=test`; they are *not* per-read validation. An unset secret on a dev machine is valid.
- `verbatim: true` on a builder disables both trimming and the blank-as-unset transform, for values where exact bytes matter.
- `choice` lower-cases before membership testing; the `allowed` array must already be lower-case.
- `minBytes` on `Presence` is a *decoded* size (after hex/base64 decode) and applies to every member of a key ring minus its `vN:` prefix; omit it for third-party-issued secrets.
- The file is truncated in this view; `email`, `timeZone`, `secret`, `csv`, `keyRing`, and `versionedKeyRing` follow the same builder pattern as those shown.
