---
source: src/modules/observability/authorization.yaml
source_sha256: 6fc15f2b623dbbf37887bfc4000ea5185747df590b20ba38c5b6db9f86f9f8c4
context_sha256: f906dad862af7735d170d6db5ae494873537b3ac345a84298daa5598e2b5a290
generated_at: 2026-11-22T06:00:14.214682+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/authorization.yaml

## Purpose
Declares the authorization rules and permission sets for the `observability` module. It defines a single platform-scope read permission covering health, metrics and the operational audit. These concern the installation as a whole, not one shop's content. The file's own comment says this is the only platform-scope module in the boilerplate, which makes the platform-scope invariant testable in the boilerplate itself.

## Key elements
- **`rules`**: one rule:
  - `action: read`
  - `subject: ObservabilitySnapshot`
  - `module: observability`
  - `scope: platform`
  - Description: "Read health, metrics overview and the operational audit."
- **`sets`**: one named set:
  - `ObservabilityDisplay` (module `observability`) bundles the rule, referenced as `read:ObservabilitySnapshot`.
  - Description: "Read health, metrics and the operational audit."

## Relationships
- Sits beside `src/modules/observability/openapi.yaml` in the same module. The authorization file declares the permission, and the OpenAPI file is the module's API description. The content shown does not say how the two are linked, such as which operations require `read:ObservabilitySnapshot`.

## Notes
- Rule references in sets use the `action:Subject` format (e.g. `read:ObservabilitySnapshot`).
- Only `read` is defined. No write or other actions exist for this module.
- `platform` scope is deliberate and distinguishes this module from others whose rules would be scoped to a shop.
