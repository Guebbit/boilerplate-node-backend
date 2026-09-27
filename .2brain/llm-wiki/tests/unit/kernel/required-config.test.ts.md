---
source: tests/unit/kernel/required-config.test.ts
sha256: 32f424bcbc4395483f5c9bbf7321c2ed9605b2b3e14848819d6632ef62d80b3a
generated_at: 2026-09-27T16:12:11.901843+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/required-config.test.ts

## Purpose

Unit tests for the kernel-level boot-gate (`assertRequiredConfig`) and its `checkSelector` helper. The suite verifies the generic mechanism — collecting all configuration failures before throwing, validating module-declared required/forbidden variables, handling comma-separated secret rings, honoring the test/demo short-circuits, and accepting caller-supplied `nonModuleChecks`. It deliberately does **not** test any specific module's or the app tier's variable lists; those live in `tests/unit/app/required-config.test.ts` and each module's own test file.

## Key elements

- **`configure()`** – local helper that sets `NODE_ENV` to `'development'` so the gate does not short-circuit.
- **`SECRET_MODULE`** – a minimal `AppModule[]` fixture (one variable, `minLength: 16`, placeholder `'change-me'`) reused across several cases.
- **`describe('module-declared variables')`** – covers placeholder detection, multi-offender collection, comma-ring split/validation, trailing-comma tolerance, `minLength: 0` semantics, and the "placeholder wins even at length 0" rule.
- **`describe('the environments that skip the gate')`** – confirms the gate is a no-op under `NODE_ENV=test` and under the demo profile.
- **`describe('module-declared forbiddenInProduction')`** – verifies that `forbiddenInProduction` entries are refused only when `NODE_ENV=production`.
- **`describe('checkSelector')`** – tests the selector-resolver wrapper: success path, preserving the resolver's error message, and the non-`Error` fallback to the bare key.
- **`describe('nonModuleChecks')`** – exercises the optional second argument to `assertRequiredConfig` (caller-declared `required` and `customChecks`).

## Relationships

- **`src/kernel/required-config.ts`** – the module under test; exports `assertRequiredConfig` and `checkSelector`.
- **`src/kernel/registry.ts`** – provides the `AppModule` type used to shape every test fixture.
- **`src/infrastructure/runtime/demo-profile.ts`** – exports `enableDemoProfile`, used to enter/exit demo mode (a gate bypass) and cleaned up in `afterEach`.
- **`tests/support/environment.ts`** – exports `withoutEnvironmentInThisFile`, called at module scope to strip `NODE_ENV` and `SECRET` from the process environment before any test runs.

## Notes

- **Every test must set `NODE_ENV` away from `'test'`** (via `configure()`) before calling `assertRequiredConfig`; otherwise the gate short-circuits and the assertion proves nothing.
- **Comma-separated "ring" values** are split member-by-member: a single placeholder member fails the whole value, a trailing comma is silently dropped (treated as a typo), and a value of only commas (`,,`) still fails.
- **`minLength: 0` does not exempt a variable from the placeholder check** — it only allows the variable to be unset.
- The file tests the **mechanism only**; app-tier variable lists (`NODE_URL`, SMTP, provider selectors) are asserted elsewhere against `APP_NON_MODULE_CHECKS`, and individual modules assert their own manifests in their own test files.
- `afterEach(() => enableDemoProfile(false))` guards against demo-profile state leaking into subsequent test files.
