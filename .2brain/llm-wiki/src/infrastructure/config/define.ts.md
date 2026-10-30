---
source: src/infrastructure/config/define.ts
sha256: 44f6bc7aed5f4ba380f202cfbb1947c77457f4dade6137c94040d5284a3462de
generated_at: 2026-10-29T01:57:47.626084+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/define.ts

## Purpose

Defines the single-layer configuration contract for the codebase: the `defineConfig` factory that turns a named set of typed `Field` rules into a memoized, typed accessor, plus the type-erased `ConfigSlice` view and the `assertConfigIn` boot gate that validates every slice at once and reports *all* problems in one error. Follows the Laravel/AdonisJS/NestJS convention: the environment is read and validated here; everything downstream reads the typed result.

## Key elements

- **`Shape` / `Parsed<TShape>`** — type aliases; a slice's field map and the mapped type of its parsed values.
- **`ConfigSlice`** — type-erased descriptor (`name`, `fields`, `inspect(env)`) shared by the boot gate and cross-slice checks.
- **`ConfigAccessor<TShape>`** — the callable returned by `defineConfig`; calling it yields `Parsed<TShape>`, `.slice` exposes the `ConfigSlice`, and `.readIn(env)` parses a foreign environment without throwing or memoizing.
- **`ConfigError`** — thrown when a slice's values fail shape validation or when the boot gate rejects the process; carries every problem in one message.
- **`isRelaxedIn(env)`** — true when `NODE_ENV` is `development` or `test`; gates presence and cross-field checks.
- **`defineConfig(definition)`** — the main factory. Builds a `ConfigSlice`, a version-keyed memoized reader, and a `readIn` helper; returns them as one object.
- **`assertConfigIn(slices, env)`** (truncated in source) — the boot gate; aggregates `slice.inspect` results across all slices, deduplicates, and throws a single `ConfigError` listing every issue.
- **Internal helpers** — `parseField`, `parseShape`, `presenceBroken`, `decodedBytes`, `describeShape`, `presenceProblems`, `configProblems`.

## Relationships

- **`src/infrastructure/config/fields.ts`** — provides the `Field<T>` and `Presence` types that every slice shape is built from.
- **`src/infrastructure/config/store.ts`** — provides `currentEnvironment()`, `environmentVersion()`, and the `Environment` type; `defineConfig` reads through the store and invalidates its memo when the version changes.
- **All other neighbors** (`scenarios/config.ts`, `src/app/config.ts`, `src/infrastructure/*/config.ts`, adapter and observability config files) — consumers that import `defineConfig` (and `Field` re-exported from `fields.ts`) to declare their own slice. They do not interact with each other through this file; each gets an independent `ConfigAccessor`.

## Notes

- **Memoization is version-keyed, not permanent.** A parse *failure* is never cached: the accessor re-parses on every call until the value is corrected.
- **Sensitive values are redacted from error messages.** `parseField` omits the raw value when `field.sensitive` is true or the variable is absent.
- **`readIn` never throws and never memoizes.** It returns `undefined` on any shape failure so that a cross-slice `check` can report the mismatch through its own slice's `checks` array.
- **Test mode short-circuits.** `inspect` returns empty `presence` and `checks` arrays when `NODE_ENV === 'test'`; only `invalid` (shape) problems are reported.
- **Hex is tested before base64** in `decodedBytes` because every valid hex string is also valid base64, which would overcount the decoded size by ~⅓.
- **The `as Parsed<TShape>` cast in `parseShape`** exists because TypeScript cannot trace a loop over `Object.entries` back to the mapped type; each value was individually validated by its own field's `safeParse`.
- **Cross-slice deduplication** in `configProblems` uses a `Set` so a variable declared by two slices (e.g. an adapter read + a module presence rule) is reported as one mistake.
