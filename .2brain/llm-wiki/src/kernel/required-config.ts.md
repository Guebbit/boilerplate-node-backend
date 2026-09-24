---
source: src/kernel/required-config.ts
sha256: 43b9c5eedaa5faf23a9b237544382e0b7e1086c1ff6ee86eb9afec3cd6b8a7d0
generated_at: 2026-09-23T17:56:17.782875+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/required-config.ts

## Purpose
Boot-time configuration gate. Collects every required environment variable across all enabled modules plus app-tier checks, validates them in a single pass, and throws once listing **all** offending variables — so a misconfigured deployment names every mistake at once instead of one per restart. Skipped entirely under `NODE_ENV=test` and the demo profile.

## Key elements
- **`NonModuleChecks` (interface)** — the shape the caller (currently `src/app/required-config.ts`) hands in for variables that belong to neither a module nor the kernel: optional `required` entries and `customChecks` callbacks.
- **`checkSelector` (const)** — wraps a resolver that *throws* on an unrecognised selector and converts that throw into the standard `string[]` message shape. Reports the resolver's own message rather than folding the bare key into the "missing / too short / placeholder" phrasing, which would misdescribe a "value present but unknown" error.
- **`assertRequiredConfig` (const, exported)** — the main entry point. Accepts `AppModule[]` and optional `NonModuleChecks`. Builds three problem buckets (missing/short/placeholder, custom-check failures, forbidden-in-production) and throws a single `Error` if any bucket is non-empty. Returns silently in test or demo mode.
- **`applies` (private)** — filters a `RequiredConfig` entry by its `productionOnly` flag against the current `NODE_ENV`.
- **`fails` (private)** — checks a comma-separated env value member-by-member against `minLength` and `placeholder`, so a key-ring variable is validated across all members, not just the first.
- **`forbiddenUnderProduction` (private)** — collects module-declared `forbiddenInProduction` variables that are actually *set* when `NODE_ENV=production` (the inverse of every other check).

## Relationships
- **`src/app/required-config.ts`** — the current caller; supplies `NonModuleChecks` for app-tier variables that no module owns and invokes `assertRequiredConfig` at startup.
- **`src/infrastructure/runtime/demo-profile.ts`** — provides `isDemoMode()` used to short-circuit the entire check for demo deployments.
- **`src/kernel/registry.ts`** — source of the `AppModule` and `RequiredConfig` types that every check consumes.
- **Module manifests** (`antibot/module.ts`, `payments/module.ts`, etc.) — each module declares its own `requiredConfig`, `customCheck`, and `forbiddenInProduction` entries on its `AppModule` object; this file reads them generically via the `appModules` array.
- **`tests/unit/kernel/required-config.test.ts`** — unit tests for the gate's own logic.
- **`tests/unit/app/required-config.test.ts`** — tests the app-tier caller and its `NonModuleChecks` wiring.
- **Module config tests** (`orders/config.test.ts`, `products/config.test.ts`, `webhooks/module.test.ts`, `antibot/module.test.ts`, `payments/module.test.ts`, `two-factor.test.ts`) — exercise the module-declared config entries that flow through this gate.

## Notes
- The throw message deliberately uses **three separate clauses** (missing/short/placeholder; custom-check failures; forbidden-set) rather than one flat list, so the operator can tell *which kind* of problem each variable has.
- `checkSelector` exists because a resolver that throws is a *different* failure category from "value absent or too short" — folding it into the bare-key list would mislead the operator.
- `fails` splits on commas so multi-member values (e.g. token key rings) are checked member-by-member; a placeholder in the *second* member still blocks boot.
- The `eslint-disable` on the try/catch in `checkSelector` is intentional: the resolver's throw **is** the signal being probed; there is no synchronous "does this throw?" API.
- The file docblock references `docs/reference/ops.md` for operational context.
