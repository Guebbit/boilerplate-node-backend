---
source: src/infrastructure/config/define.ts
sha256: b84cbc3a25a7a1936f9678a5dd494b281741eb9784029d8091c69f0fdbbf945c
generated_at: 2026-10-14T07:50:59.902241+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/define.ts

## Purpose

Defines the `defineConfig` factory and its supporting types for a single-layer, typed environment-reading system. Each module owner declares a *slice* (a name, a set of `Field` rules keyed by variable name, and an optional cross-field check); `defineConfig` turns that into a memoized, fully-typed accessor. The file also provides the type-erased `ConfigSlice` interface and the boot-gate aggregation helpers (`configProblems`, `assertConfigIn`) that validate every slice at once and report all failures in a single `ConfigError`.

## Key elements

- **`Shape` / `Parsed<TShape>`** — The input (fields keyed by variable name) and output (each field's parsed value type) mapped types.
- **`ConfigDefinition<TShape>`** — The object passed to `defineConfig`: `name`, `shape`, and optional `check` callback.
- **`ConfigAccessor<TShape>`** — The callable return of `defineConfig`. Calling it returns `Parsed<TShape>`; `.slice` exposes the type-erased `ConfigSlice`; `.readIn(env)` parses a specific environment without memoizing or throwing.
- **`ConfigSlice` / `FieldInfo` / `SliceProblems`** — Type-erased views shared by the boot gate and slice lists, so it can inspect any slice without knowing its concrete shape.
- **`ConfigError`** — Thrown by the accessor on invalid values and by the boot gate when any slice has problems.
- **`isRelaxedIn`** — Returns `true` when `NODE_ENV` is `development` or `test`; presence and cross-field checks are skipped in `inspect` under this condition (except in `test` where *all* checks beyond shape are skipped).
- **`parseField` / `parseShape`** — Per-field (Zod `safeParse`) and whole-shape validation. Sensitive field values are omitted from error messages.
- **`decodedBytes`** — Computes the byte length of a ring-entry key (hex or base64), checking the alphabet before the encoding to avoid `Buffer`'s silent base64 skipping.
- **`presenceBroken`** — Validates a presence rule (min length, placeholder, min bytes) against a raw value; comma-separated ring values are checked member-by-member.
- **`presenceProblems`** — Collects presence violations for a slice outside `NODE_ENV=test`.
- **`configProblems`** — Aggregates and deduplicates problems across all slices for the boot gate.
- **`assertConfigIn`** *(truncated in source)* — The boot gate that throws `ConfigError` listing every problem across every slice.

## Relationships

- **`src/infrastructure/config/fields.ts`** — Source of the `Field` and `Presence` types that every slice shape is built from.
- **`src/infrastructure/config/store.ts`** — Provides `currentEnvironment`, `environmentVersion`, and the `Environment` type; the accessor memoizes against the store's version and reads from its current environment.
- **`src/app/config.ts`, `scenarios/config.ts`, `src/kernel/config.ts`** — Top-level config slices that call `defineConfig` and are passed to the boot gate.
- **`src/infrastructure/adapters/config.ts`, `src/infrastructure/adapters/antibot-providers/index.ts`, `src/infrastructure/adapters/mail-transports.ts`** — Adapter-level slices defining their own fields (e.g. credential rings, transport URLs).
- **`src/infrastructure/http/config.ts`, `src/infrastructure/i18n/config.ts`, `src/infrastructure/observability/config.ts`, `src/infrastructure/observability/analytics/index.ts`, `src/infrastructure/persistence/config.ts`, `src/infrastructure/runtime/config.ts`, `src/infrastructure/security/config.ts`** — Module-level slices, each calling `defineConfig` with their own `Shape` and (optionally) a `check` that may read another slice via `.readIn`.

## Notes

- **Memoization is version-keyed, not value-keyed.** A parse failure is *never* cached, so a bad value throws on every read until corrected. A successful parse is cached until `environmentVersion` changes.
- **`readIn` never throws and never memoizes.** It is the sanctioned path for cross-slice `check` callbacks, ensuring each variable has exactly one parser.
- **`NODE_ENV=test` suppresses presence and cross-field checks** in `inspect`; only shape (Zod) problems are reported. This keeps test fixtures minimal.
- **Sensitive values are scrubbed from error strings** in `parseField`; the raw value is replaced with an empty string.
- **Ring (comma-separated) values** are validated member-by-member for presence, and `decodedBytes` is checked per member. A single truncated or placeholder member fails the whole rule.
- **Hex is tested before base64** in `decodedBytes` because every hex string is also valid base64; testing base64 first would overcount by a third.
- **`Object.freeze`** is applied to the parsed values object, making the accessor's return value immutable at runtime.
- The `as Parsed<TShape>` cast in `parseShape` works around TypeScript's inability to infer mapped types through `Object.entries` loops.
