---
source: src/infrastructure/config/define.ts
sha256: 44f6bc7aed5f4ba380f202cfbb1947c77457f4dade6137c94040d5284a3462de
generated_at: 2026-11-08T03:24:45.195397+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/define.ts

## Purpose
Defines the core configuration-slice system. `defineConfig` turns a named, typed set of environment-variable fields (with optional cross-field validation) into a memoised, type-safe accessor. This is the single layer where the environment is read and validated; every other part of the app consumes the typed result, following the Laravel/AdonisJS/NestJS/Spring convention of one parse point.

## Key elements
- **`Shape`** — `Readonly<Record<string, Field<unknown>>>`; the type of a slice's field map keyed by env-var name.
- **`Parsed<TShape>`** — Mapped type that resolves each `Field<T>` to its parsed type `T`.
- **`FieldInfo`** — Type-erased per-field metadata (name, optional presence rule, sensitivity flag) used by the boot gate.
- **`SliceProblems`** — Groups a slice's issues into `invalid`, `presence`, and `checks` buckets.
- **`ConfigSlice`** — Type-erased view of a slice (name, fields, `inspect(env)` method) shared across slices and the boot gate.
- **`ConfigAccessor<TShape>`** — A callable returning `Parsed<TShape>`, augmented with `.slice` (the `ConfigSlice`) and `.readIn(env)` (parse against a given environment without memoising or throwing).
- **`ConfigError`** — Thrown when a value is refused or the boot gate finds problems.
- **`isRelaxedIn(env)`** — Returns `true` when `NODE_ENV` is exactly `development` or `test`; used to skip presence checks.
- **`ConfigDefinition<TShape>`** — Input to `defineConfig`: `name`, `shape`, optional `check(config, env) → string[]`.
- **`defineConfig<TShape>(definition)`** — The main factory. Builds a `ConfigSlice`, a memoised reader (invalidates on store version change), and a non-throwing `readIn`. Returns the `ConfigAccessor`.
- **`configProblems(slices, env)`** / **`assertConfigIn`** (truncated) — Aggregate all slices' problems, deduplicate, and throw a single `ConfigError` listing every mistake at boot.
- **`presenceBroken`** — Per-member validation of comma-separated values (min length, placeholder detection, `minBytes` via hex/base64 decode).
- **`parseField` / `parseShape`** — Zod `safeParse` per field; sensitive values are never included in error messages.

## Relationships
- **`src/infrastructure/config/fields.ts`** — Source of the `Field<T>` and `Presence` types that shape every slice.
- **`src/infrastructure/config/store.ts`** — Provides `currentEnvironment()`, `environmentVersion()`, and the `Environment` type that the memoisation and `inspect` logic read against.
- **All `*/config.ts` files** (`src/app/config.ts`, `src/kernel/config.ts`, `src/infrastructure/adapters/config.ts`, `src/infrastructure/persistence/config.ts`, `src/infrastructure/security/config.ts`, `src/infrastructure/i18n/config.ts`, `src/infrastructure/observability/config.ts`, `src/infrastructure/http/config.ts`, `src/infrastructure/runtime/config.ts`, `scenarios/config.ts`, etc.) — Each defines its slice via `defineConfig` and exports the resulting accessor; the boot gate (`assertConfigIn`) in this file validates all of them collectively.
- **`src/infrastructure/adapters/antibot-providers/index.ts`**, **`src/infrastructure/observability/analytics/index.ts`** — Consume specific slices (e.g. antibot ring keys, analytics keys) whose presence/length rules are declared here.

## Notes
- **Memoisation invalidation** is keyed on `environmentVersion()` from the store, not on a deep-equality check. A parse failure is *never* memoised, so a bad value throws on every read until fixed.
- **Credential safety:** `parseField` omits the raw value from error messages when `field.sensitive` is `true`. Presence checks similarly never log the value.
- **`decodedBytes`** checks hex *before* base64 because every hex string is also valid base64; the alphabet is validated first because `Buffer.from(x, 'base64')` silently skips invalid characters.
- **`readIn`** never throws and never memoises — it is designed for cross-slice `check` callbacks that need to read another slice's values from a *given* environment.
- **Deduplication** in `configProblems`: if two slices both declare the same variable (e.g. an adapter reads it, a module adds a presence rule), the error lists it once.
- The file documents itself as the "one layer" boundary; downstream code should never call `process.env` or `currentEnvironment()` directly.
