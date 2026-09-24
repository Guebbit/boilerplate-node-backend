---
source: tests/unit/kernel/required-config.test.ts
sha256: bd3a80de085a97c62e10f5a03f53a7d3ce71601a139f13563785cf4ce44d2428
generated_at: 2026-09-23T20:28:02.274280+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/required-config.test.ts

## Purpose

Unit tests for the kernel-level boot-gate mechanism: `assertRequiredConfig` (collect-and-report required-config violations before the process can start) and `checkSelector` (validate enum-style provider selectors). The file exists to pin down the *mechanism* the kernel owns—placeholder detection, multi-offender reporting, ring validation, environment bypasses, forbidden-in-production, and caller-supplied checks—while deliberately leaving app-tier and module-specific variable names to their own test files.

## Key elements

- **`configure()`** (local helper) — sets `NODE_ENV` to `'development'` so the gate does not short-circuit; every case that expects enforcement calls this first.
- **`afterEach(() => enableDemoProfile(false))`** — resets the demo-profile flag so one test's bypass cannot leak into the next.
- **"module-declared variables" group** — asserts placeholder-value detection, that *all* offenders are named in one throw (not just the first), and that comma-separated ring values are validated member-by-member.
- **"the environments that skip the gate" group** — confirms `NODE_ENV=test` and the demo profile both cause `assertRequiredConfig` to pass unconditionally.
- **"module-declared forbiddenInProduction" group** — verifies a variable flagged as forbidden is rejected when set *and* `NODE_ENV=production`, but accepted everywhere else.
- **`checkSelector` tests** — empty result on success; the resolver's own error message is preserved verbatim; fallback to the bare key name if a non-`Error` is thrown.
- **"nonModuleChecks" group** — exercises the second argument (`required` / `customChecks`) that a non-module caller can contribute alongside module checks.

## Relationships

- **`src/kernel/required-config.ts`** — the SUT; provides `assertRequiredConfig` and `checkSelector`.
- **`src/kernel/registry.ts`** — supplies the `AppModule` type used to build inline fixtures.
- **`src/infrastructure/runtime/demo-profile.ts`** — provides `enableDemoProfile` toggled in the bypass tests and reset in `afterEach`.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile(['NODE_ENV', 'SECRET'])` to isolate this file from ambient environment variables.

## Notes

- The gate is a no-op under `NODE_ENV=test`; any test that omits the `configure()` call (or the equivalent explicit assignment) will silently pass without asserting anything. The file header calls this out explicitly.
- Scope boundary is intentional: variables that belong to no module but are not the kernel's own (e.g. `NODE_URL`, SMTP, provider selectors) are tested in `tests/unit/app/required-config.test.ts` against `APP_NON_MODULE_CHECKS`. Module-owned variables are tested in each module's own test file.
- Ring (comma-separated) validation is member-by-member: the joined string is never compared as a whole, and each member must individually clear `minLength` and differ from `placeholder`.
- `checkSelector` preserves the resolver's error message verbatim; it does not collapse to the bare key. The one exception is a non-`Error` throw, where it falls back to `"Unknown <KEY>"`.
