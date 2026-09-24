---
source: src/modules/account/module.yaml
sha256: b0e17645549e39f13232745cc9d244cab63a0e0aa9c6509c456473a1e2c7627c
generated_at: 2026-09-23T18:05:47.289822+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.yaml

## Purpose

Module manifest that declares the account module's subdomain classification and its explicit inter-module dependencies. Serves as the machine-readable contract the build/test tooling reads to wire up the account module at runtime and to enforce dependency boundaries.

## Key elements

- **`subdomain: supporting`** — tags the account module under the "supporting" subdomain, distinguishing it from core-domain modules in the project's layered architecture.
- **`dependsOn`** — a list of modules the account module is allowed to import from:
  - `access` — used for role operations (`rolesOf`, `assignRole`, `assignDefaultRole`, `promoteVerifiedCustomer`).
  - `users` — the shared `User` document; the repo's single shared kernel for identity.

## Relationships

- **src/modules/account/module.ts** — The TypeScript implementation this YAML configures. The manifest constrains which other modules `module.ts` may import.
- **tests/audit/compliance-rules.yaml** — Defines the rules (e.g., allowed subdomains, dependency direction) that this declaration is validated against during the audit test suite.
- **src/modules/addresses/module.ts** / **src/modules/wishlist/module.ts** — Sibling modules in the same area; no direct dependency is declared here, but they exist as peers in the module graph the tooling assembles.

## Notes

- The `dependsOn` list is the *entire* set of permitted cross-module imports. Any import in `module.ts` that is not listed here will (presumably) be flagged by the compliance audit.
- The inline comments after each dependency name are documentation only; they do not affect resolution.
