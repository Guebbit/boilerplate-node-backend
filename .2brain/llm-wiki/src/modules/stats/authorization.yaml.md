---
source: src/modules/stats/authorization.yaml
sha256: 843e4f447eb67b391fe8d1959d772cecd1c72878f05e1c1b075815292b843dde
generated_at: 2026-11-08T08:23:32.114218+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/authorization.yaml

## Purpose

Declares the authorization rules and permission sets for the **stats** module. It defines who may read shop-level sales metrics (revenue, orders, products, customers, payment mix) and bundles that permission into a reusable set that other files can reference by name.

## Key elements

- **`rules`** – A single rule: `read` on subject `Stats` (module `stats`, scope `tenant`, `credential: false`). This is the only action permitted on the Stats subject; no write/create/delete rules exist here.
- **`sets.StatsDisplay`** – A named permission set (module `stats`) that groups the `read:Stats` rule. Other modules or policies can grant access to this module's read capability by referencing `StatsDisplay` instead of spelling out the individual rule.

## Relationships

- **`src/modules/stats/module.ts`** – The TypeScript module this YAML file authorizes. The `module: stats` key in both the rule and the set links this authorization definition to the code registered in `module.ts`. The `Stats` subject name in the YAML must match the subject name exported or registered there.

## Notes

- `credential: false` means no additional credential check is required beyond the tenant-scope identity; the rule is granted purely on tenancy.
- The set name `StatsDisplay` is the canonical identifier for granting stats read access elsewhere (e.g., role definitions or other modules' authorization files). Changing the set name would break any external references.
- Only one action (`read`) is defined. If write or aggregate operations are added to `module.ts` later, a corresponding rule and set entry must be added here.
