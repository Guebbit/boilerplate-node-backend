---
source: src/modules/account/module.yaml
sha256: 94f19e81bddba46ffc1a1b671fe6aa80b23e2f4de78e93a723f2fc5bfdfbd8e6
generated_at: 2026-10-14T08:42:08.549901+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/module.yaml

## Purpose

Machine-readable module descriptor for the account subdomain. It declares the module's scope (signup, login, sessions, two-factor, OAuth, account lifecycle), its classification, and its hard dependencies so the module system and tooling can resolve imports without parsing TypeScript.

## Key elements

- **summary** – Human-facing one-liner describing the module's responsibility.
- **subdomain: `generic`** – Classifies the module as generic (not domain-specific).
- **group: `foundation`** – Places the account module in the foundation tier, signalling it sits below feature-level modules in the dependency order.
- **dependsOn** – Declares two required dependencies with inline comments:
  - `access` — provides role utilities (`rolesOf`, `assignRole`, `assignDefaultRole`, `promoteVerifiedCustomer`).
  - `users` — provides the shared `User` document (the repo's single shared kernel).

## Relationships

- **`src/modules/account/module.ts`** — The TypeScript implementation this YAML configures; the `.yaml` is its declarative manifest.
- **`tests/audit/compliance-rules.yaml`** — Compliance/audit test that validates module declarations (subdomain, group, dependency rules) like this one.

## Notes

- The inline `#` comments on `dependsOn` entries are load-bearing documentation: they state *which* symbols are expected from each dependency. If the consuming code changes which access/users functions it uses, these comments should be updated in the same PR.
- Because the module is tagged `group: foundation`, other modules (addresses, wishlist) may depend on it, but it must not depend on them.
