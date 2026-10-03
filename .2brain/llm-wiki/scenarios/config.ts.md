---
source: scenarios/config.ts
sha256: 6c49e3967a92b0b55ef083fb9aa8cf131119ecf4b02f1bb8ebb81235674d7091
generated_at: 2026-10-01T12:20:32.494101+00:00
model: ollama:qwen3.8:27b
---

# scenarios/config.ts

## Purpose

Defines the twelve `NODE_SEED_*_PASSWORD` environment variables as a typed config slice for the demo seed accounts. It exists so that seed passwords are read through the same config infrastructure as the rest of the app (giving a consistent "blank means unset" semantic and a single source for documentation), even though the seeder is a script rather than part of the application's boot path.

## Key elements

- **`seedPassword(account, fallback)`** — internal factory that wraps a value in a `text` field with `sensitive: true` and a human-readable description. The `fallback` is the committed demo password used when the variable is unset.
- **`seedPasswordsConfig`** (exported) — a `defineConfig` instance named `'scenario-seeds'` whose `shape` maps the twelve `NODE_SEED_*_PASSWORD` keys to their `text` fields. This is what downstream consumers (the seeder script, docs generators) import.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the builder used to declare the `seedPasswordsConfig` object.
- **`src/infrastructure/config/fields.ts`** — provides the `text` field primitive that each password entry is built from.
- **`scenarios/accounts.ts`** — the seed-account definitions that this config's passwords pair with (the `describe` strings reference the same account names).
- **`scripts/docs/generate-config-reference.ts`** — consumes config slices like this one to produce the variable table in `docs/tools/configuration.md`; because this file registers its fields through the same layer, its twelve variables appear in that generated list.

## Notes

- The fallback passwords are real, committed values — not placeholders. Safety relies on `scenario:apply` refusing to run outside development/test, not on the values being secret.
- The description string for every field reminds the reader to keep the value identical to the paired frontend's own `.env`; a mismatch will break the demo login.
- Despite being a config slice, this file is **not** part of the application's boot gate — it only matters to the seeder script and tooling.
