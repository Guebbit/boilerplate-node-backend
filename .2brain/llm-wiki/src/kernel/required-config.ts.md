---
source: src/kernel/required-config.ts
sha256: d1a3d8cdb217596f03fb4aed4d1aebf19fc838c3908952f8bef1617b570ae8a4
generated_at: 2026-09-27T14:20:01.016373+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/required-config.ts

## Purpose

Boot-time configuration gate. Before the application starts, it validates every required environment variable across all enabled modules plus app-tier checks, collecting **all** failures into a single thrown error so a misconfigured deployment reports every mistake at once instead of one per restart.

## Key elements

- **`NonModuleChecks`** (interface) — App-tier configuration checks that belong to no module: declarative `required` entries (same shape as a module's `requiredConfig`) and `customChecks` callbacks returning `string[]`.
- **`checkSelector`** (function) — Probes a resolver that throws on an unrecognised selector; returns `[]` on success or a one-element array with the resolver's own error message on failure. Used to confirm a configured provider/implementation exists in this build.
- **`assertRequiredConfig`** (function) — The main entry point. Merges module-declared `requiredConfig`, `NonModuleChecks`, module `customCheck` callbacks, and `forbiddenInProduction` entries; throws once with every problem listed if any check fails. No-ops under `NODE_ENV=test` or demo mode.
- **`applies` / `fails` / `forbiddenUnderProduction`** (internal helpers) — Scope filtering (`productionOnly`), value validation (absent / too short / placeholder, including comma-separated member-by-member), and inverse production-forbidden check respectively.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` and `RequiredConfig` types consumed throughout this file.
- **`src/infrastructure/runtime/demo-profile.ts`** — Supplies `isDemoMode()`; when true, `assertRequiredConfig` returns early so demo deployments (often booted from a copied `.env-example`) are not blocked.
- **`src/app/required-config.ts`** — The current caller that assembles and passes the `NonModuleChecks` object into `assertRequiredConfig`.
- **`tests/unit/kernel/required-config.test.ts`** — Unit tests for this module's exports.
- **`tests/unit/app/required-config.test.ts`** — Tests the app-tier caller path.
- **`tests/unit/scripts/setup/first-run.test.ts`** — Exercises the gate in the first-run setup scenario.
- **Module tests** (antibot, payments, orders, products, webhooks, account) — Exercise `assertRequiredConfig` indirectly through their module manifests' `requiredConfig` / `customCheck` / `forbiddenInProduction` declarations.

## Notes

- `minLength: 0` means "may stay unset": an empty value passes, but the literal placeholder string is still refused if the variable *is* set to it.
- Comma-separated values (e.g. token key rings) are validated **member-by-member**; a placeholder or truncation on any member — not just the first — fails the check. Blank members from trailing commas are dropped, not treated as missing.
- `checkSelector` deliberately reports the resolver's own thrown message (which names the variable and allowed values) rather than folding into the generic "missing, too short, or placeholder" phrasing used for bare-key entries.
- The thrown error message uses three distinct clauses (one per failure shape) so the operator can tell which kind of problem applies to which variable.
- `forbiddenInProduction` is the inverse of every other check: it refuses a variable that **is** set in production rather than one that is absent.
