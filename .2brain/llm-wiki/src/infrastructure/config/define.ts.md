---
source: src/infrastructure/config/define.ts
source_sha256: 97ceda9d1fe1dee6aaf0af36ce917f5c99e33f2e1bb28e5986d837a541d525d3
context_sha256: 08ec2cf2c07c7683b55f7b855bb443a35eea7bc8b19365735ad242f23c9fea2a
generated_at: 2026-11-22T02:43:36.320711+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/define.ts

## Purpose
Defines the "config slice" primitive: one owner's slice of the environment, made of a name, a shape of `Field`s keyed by environment-variable name, and an optional cross-field check. `defineConfig` turns that into a typed, memoised accessor. The environment is read in one layer and validated against a schema, and everything else reads the typed result. A boot gate (`assertConfigIn`) validates all slices at once and reports every problem, not just the first.

## Key elements
- **`Shape` / `Parsed<TShape>`**: a slice's fields keyed by variable name, and the typed values derived from it.
- **`FieldInfo`**: the type-erased description of a field (`name`, optional `presence` rule, `sensitive`).
- **`SliceProblems`**: problems grouped as `invalid` (shape refused), `presence` (missing, too short, placeholder, or too few key bytes) and `checks` (cross-field messages).
- **`ConfigSlice`**: the type-erased view of a slice. It has `name`, `fields` and `inspect(environment)`. Boot code and lists of slices use this view.
- **`ConfigAccessor<TShape>`**: the callable returned by `defineConfig`. Calling it returns the typed values. It also carries:
  - `.slice`: the type-erased `ConfigSlice`.
  - `.readIn(environment)`: parses a given environment. It never throws and never memoises, and returns `undefined` on a misfit value.
- **`ConfigError`**: the error thrown when a slice can't be read, and by the boot gate.
- **`isRelaxedIn(environment)`**: true only when `NODE_ENV` is exactly `development` or `test`.
- **`ConfigDefinition`**: the input to `defineConfig` (`name`, `shape`, optional `check(config, environment)` returning a list of problem strings).
- **`defineConfig(definition)`**: builds the accessor and slice.
  - `read` parses the store's current environment and memoises the result against `environmentVersion()`.
  - A refusal throws `ConfigError("Invalid configuration (<name>): ...")` and is never cached.
  - Parsed values are frozen.
- **`assertConfigIn(slices, environment)`**: the boot gate. It refuses to boot on any problem in any slice, using the internal `configProblems` aggregator. Its body is not shown in the visible portion of the file.

Internal helpers:
- `parseField` and `parseShape` do the parsing.
- `presenceBroken` and `presenceProblems` apply presence rules.
- `decodedBytes` measures key length.
- `describeShape` builds the `FieldInfo` list.

## Relationships
- Imports the `Field` and `Presence` types from `./fields` (`src/infrastructure/config/fields.ts`), which supply each field's `schema`, `sensitive` flag and `presence` rule.
- Imports `currentEnvironment`, `environmentVersion` and the `Environment` type from `./store` (`src/infrastructure/config/store.ts`). The accessor reads the environment and its version from there, and the version drives memoisation.
- The neighbouring `config.ts` modules (`scenarios/config.ts`, `src/app/config.ts`, `src/infrastructure/adapters/config.ts`, `src/infrastructure/http/config.ts`, `src/infrastructure/i18n/config.ts`, `src/infrastructure/observability/config.ts`, `src/infrastructure/persistence/config.ts`, `src/infrastructure/runtime/config.ts`, `src/infrastructure/security/config.ts`, `src/kernel/config.ts`), plus `src/infrastructure/adapters/mail-transports.ts` and `src/infrastructure/adapters/antibot-providers/index.ts`, are graph neighbours. Per the module doc, each owner defines its slice with `defineConfig`. The file content shown does not confirm the details of how each one uses it.

## Notes
- **Test environment:** with `NODE_ENV=test`, `inspect` reports only shape problems. Presence and cross-field checks are skipped.
- **Production-only presence rules:** a presence rule with `productionOnly` is skipped when the environment is relaxed (`development` or `test`). `skipWhen(environment)` can also exempt a field.
- **Secrets stay out of messages:** error messages for `sensitive` fields never include the raw value. Other fields include up to 60 characters of it.
- **Rings of values:** presence is checked per member of a comma-separated value, so a placeholder or truncated key anywhere in a ring fails. Blank members, such as from a trailing comma, are ignored. A `vN:` prefix is stripped before the byte count is measured.
- **Key decoding:** `minBytes` is checked by trying hex first and then base64, after validating the alphabet. A value that is neither counts as 0 bytes.
- **Duplicate variables across slices:** `configProblems` deduplicates identical messages, so a variable declared by two slices is reported once.
- **Cross-slice checks:** a check in one slice should read another slice through its `readIn`, not through raw variables, so each variable has a single parser.
