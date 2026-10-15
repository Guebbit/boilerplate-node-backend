---
source: tests/unit/infrastructure/config/define.test.ts
sha256: 8383b50d5c5b7355945cf88660bdb544731885f55f73e7ce42ba6ad343f05ff7
generated_at: 2026-10-15T13:10:06.983774+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/define.test.ts

## Purpose

Unit tests for the config-definition API (`defineConfig`, its accessor, `readIn`, `assertConfigIn`, and `isRelaxedIn`). They pin down the gate's contract: shape rules apply everywhere, presence rules are waived in dev/test, production-only rules fire outside those, credentials are never echoed in error messages, and all mistakes in a slice are reported in a single grouped message.

## Key elements

- **`slice`** — a `defineConfig` instance exercising one field of each rule kind (`int`, `flag`, `secret` with `productionOnly`, `text` with required), plus a cross-field `check`. Used as the primary fixture.
- **`GOOD`** — a production-shaped environment object that satisfies every rule in `slice`.
- **`isRelaxedIn` tests** — table-driven check that `development` and `test` are relaxed; `production`, `staging`, and `undefined` are not.
- **Accessor tests** — defaults filled in, env overrides visible on next call, the env is read once per call (subsequent `process.env` writes are ignored), referential identity when nothing changed, object freezing, `ConfigError` with variable name, and that `sensitive: true` values are masked out of the error message.
- **`readIn` tests** — parses the object it is handed (not the global store) and returns `undefined` (not a throw) for a misfit value.
- **`assertConfigIn` tests** — the boot gate: passes a valid deployment; lists all mistakes in one message grouped by kind (invalid values vs. missing/placeholder); runs the slice `check` on parsed values; skips `check` when a value is already invalid; applies `productionOnly` only outside dev/test; applies plain presence rules in dev but not in test; still enforces shape rules under test; validates every member of a key ring individually; respects `skipWhen` predicates on `secret` fields; enforces `minBytes` by decoding (hex/base64/base64url) rather than counting characters; preserves declaration order in `slice.fields`.

## Relationships

- **`src/infrastructure/config/define.ts`** — the module under test. Provides `defineConfig`, `assertConfigIn`, `isRelaxedIn`, and `ConfigError`.
- **`src/infrastructure/config/fields.ts`** — field-constructor helpers (`int`, `flag`, `secret`, `text`) used to build the `shape` object in `slice` and in ad-hoc slices defined inline (e.g. `secrets`, `ring`, `switched`, `keyed`).
- **`tests/support/environment.ts`** — provides `setEnvironment`, `setProcessEnvironment`, and `resetEnvironment` to manipulate the env store the accessor reads from and to clean up between tests.

## Notes

- The accessor reads the environment **once per call**; a later write to `process.env` does not affect an already-returned snapshot. Tests assert referential identity (`toBe`) to lock this in.
- `readIn` is deliberately non-throwing (returns `undefined`) whereas the accessor throws `ConfigError`. This distinction is tested explicitly.
- `minBytes` validation decodes the value as hex, base64, or base64url before measuring; a passphrase that is long in characters but short in decoded bytes is still refused. Ring entries are checked individually.
- Error messages are asserted with exact regex (including grouping separators and the "Refusing to boot" prefix), so any rewording of the gate's message will break these tests.
- The `switched` slice demonstrates that `skipWhen` is evaluated against the *environment object* passed to `assertConfigIn`, not against the global env.
