---
source: tests/unit/infrastructure/config/define.test.ts
sha256: 8383b50d5c5b7355945cf88660bdb544731885f55f73e7ce42ba6ad343f05ff7
generated_at: 2026-11-08T10:11:21.154215+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/define.test.ts

## Purpose

Unit tests for the config-slice system in `@infrastructure/config/define`. Covers the four public concerns of the module: the `isRelaxedIn` environment classifier, the typed accessor (defaults, overrides, caching, freezing, error formatting, credential redaction), the non-throwing `readIn` parser, and the boot gate `assertConfigIn` (shape validation, presence rules, production-only rules, cross-field checks, key-ring and byte-length enforcement, and error-message grouping).

## Key elements

- **`slice`** – A `defineConfig` fixture with one field of each rule kind (`int`, `flag`, `secret`, `text`) plus a cross-field `check`. Used as the primary subject across most describe blocks.
- **`GOOD`** – A minimal production-shaped environment object that satisfies the slice.
- **`isRelaxedIn`** – Table-driven check that only `development` and `test` (and `undefined`) are *not* relaxed; `production` and `staging` are.
- **`describe('the accessor')`** – Verifies defaults, per-call overrides, single-read caching (later `process.env` writes are ignored), referential stability, `Object.isFrozen`, `ConfigError` naming the variable, and that secrets never appear in error text.
- **`describe('readIn')`** – Confirms `slice.readIn(env)` parses the *passed* object (not the store) and returns `undefined` on a misfit instead of throwing.
- **`describe('assertConfigIn')`** – The boot gate:
  - Lists **all** failures in one message, grouped by rule kind (shape vs. presence vs. cross-field check).
  - Runs the slice `check` only when shape is valid.
  - `productionOnly` secrets are enforced outside `development`/`test`.
  - Plain presence rules are enforced in `development` but waived in `test`.
  - `skipWhen` lets a field opt out based on another variable's value.
  - `minBytes` decodes hex / base64 / base64url and judges every ring member individually.
  - Field order in `slice.fields` matches declaration order.

## Relationships

- **`src/infrastructure/config/define.ts`** – The module under test. Exports `ConfigError`, `assertConfigIn`, `defineConfig`, and `isRelaxedIn` which this file imports and exercises directly.
- **`src/infrastructure/config/fields.ts`** – Provides the field-constructor factories (`flag`, `int`, `secret`, `text`) used to build the test slices.
- **`tests/support/environment.ts`** – Supplies `resetEnvironment`, `setEnvironment`, and `setProcessEnvironment` helpers that the accessor and boot-gate tests use to simulate different process environments between cases.

## Notes

- The accessor is **read-once**: calling `slice()` caches the parsed environment; subsequent `process.env` mutations are invisible to later `slice()` calls. Tests assert this explicitly.
- `readIn` is the **non-throwing** alternative to the accessor: it returns `undefined` for a shape-mismatch rather than a `ConfigError`. Useful for optional lookups.
- `assertConfigIn` collects **every** violation into a single `Refusing to boot: …` message, grouped by rule kind, rather than failing fast on the first error.
- The byte-length check (`minBytes`) is stricter than `minLength`: a 40-character hex string is only 20 bytes and will be refused when `minBytes: 32`. Values that are neither valid hex nor base64 are always refused regardless of character length.
- `skipWhen` is evaluated against the **raw** environment object, not parsed values, so it can branch on any other variable's raw string.
