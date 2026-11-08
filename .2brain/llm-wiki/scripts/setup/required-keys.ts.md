---
source: scripts/setup/required-keys.ts
sha256: 268841abb5834080a312c9d844211e87befc0534928e724109b0c53743c2289e
generated_at: 2026-11-08T03:02:19.028624+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/required-keys.ts

## Purpose

Derives the authoritative list of environment variables that `npm run setup` is allowed to fill, by reading the same config-slice declarations the runtime uses. This eliminates a hand-maintained list: any new module field that declares a `placeholder` is automatically included.

## Key elements

- **`FillableKey`** (interface) — a pair of `{ key, placeholder }` identifying one env var and the exact placeholder string to replace.
- **`fillableKeys()`** (exported function) — iterates `allConfigSlices(enabledModules)`, collects every field whose `presence` rule includes a `placeholder`, and returns a deduplicated `FillableKey[]`. Fields without a placeholder (e.g. `NODE_URL`, `NODE_CORS_ORIGIN`) are excluded because they represent "must be set" constraints, not "replace this token" ones.

## Relationships

- **`src/app/config.ts`** — provides `allConfigSlices`, the single source of field/presence definitions consumed here.
- **`src/modules.ts`** — provides `enabledModules`, which scopes the slice iteration to active modules only.
- **`scripts/setup/index.ts`** — the setup orchestrator; calls `fillableKeys()` to know which placeholders it may write into the environment file.
- **`scripts/setup/environment-file.ts`** — reads the resulting key/placeholder pairs to perform the actual file substitution.
- **`tests/unit/scripts/setup/required-keys.test.ts`** — unit-tests the derivation logic directly.
- **`tests/unit/scripts/setup/first-run.test.ts`** — exercises the end-to-end first-run flow that depends on this list.

## Notes

- A field is eligible **only** if its `presence` object has a truthy `placeholder` string. A field that merely requires presence (no placeholder) is intentionally *not* a `FillableKey` — it is the operator's responsibility to supply.
- Deduplication is via a `Map` keyed on the variable name, so if the same name appears in more than one slice the last one wins.
- The function is a pure reader of the config graph; it performs no I/O and has no side effects.
