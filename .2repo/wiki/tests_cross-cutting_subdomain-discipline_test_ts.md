# tests/cross-cutting/subdomain-discipline.test.ts

## Purpose

Architectural guard that enforces two structural rules across all enabled modules: every module must declare a valid subdomain classification (`core`, `supporting`, or `generic`), and `generic` modules must not contain a `domain/` directory. It exists to keep DDD's subdomain guidance actionable rather than aspirational — a mislabelled or bloated generic module is caught at CI time instead of in review.

## Key elements

- **`withSubdomain(subdomain)`** — filters `enabledModules` by the given `Subdomain` value and returns the matching module names. Used by the generic-domain-layer test.
- **`MODULES_ROOT`** — resolved path to `src/modules`, the root under which each module's directory (and any `domain/` folder) is expected to live.
- **`describe('subdomain classification') > 'classifies every enabled module'`** — asserts no enabled module has a `subdomain` outside the three allowed values.
- **`describe('subdomain classification') > 'keeps a domain layer out of generic subdomains'`** — asserts that no module tagged `generic` has a `domain/` directory on disk (checked via `existsSync`).

## Relationships

- **`src/modules.ts`** — supplies `enabledModules`, the array of module descriptors (name, subdomain, etc.) that both tests iterate over.
- **`src/kernel/registry.ts`** — provides the `Subdomain` type (the `core | supporting | generic` union) that constrains the `withSubdomain` helper's parameter and the valid-value check.
- **`docs/theory/modules.md`** — the theoretical document that defines what each subdomain classification means and why generic subdomains should avoid a dedicated domain layer; this test operationalises those rules.

## Notes

- The file **deliberately does not** require a `core` module to possess a `domain/` folder. Thin core rules living in the service layer are considered a valid state; forcing the directory would only produce empty ones.
- Honesty of the label is **not** enforced. If every module drifts to `core`, both tests pass silently. Detecting that drift is a review obligation, not a test responsibility.
- In a starter-kit / boilerplate context the classification values are a worked example, not a finding. The mechanism (the two rules) is the deliverable; a real project re-decides the values.
- The second test performs a **filesystem check** (`existsSync`), so it depends on the on-disk layout of `src/modules/<name>/domain/`. Renaming or relocating that folder without updating the test will cause a false failure.
