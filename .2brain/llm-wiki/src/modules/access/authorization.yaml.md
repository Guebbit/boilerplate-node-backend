---
source: src/modules/access/authorization.yaml
sha256: 00541d996fb9875b9c1ee415963434138889e7b688d2ad63c9763de2de641ba4
generated_at: 2026-11-14T18:25:08.157244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/authorization.yaml

## Purpose
Declarative authorization policy for the access module. It defines the single staff-role permission (`assign:Role`) and bundles it into the `RoleManagement` set, governing who may hand a staff role to an account, revoke it, or mutate an account that already holds one.

## Key elements
- **`assign:Role` rule** — The one permission that protects staff accounts. Scope: `tenant`, no credential required. Enforces `stepUp: critical` (fresh login required, preventing a stolen session from quietly changing powers). Denied callers receive `ROLE_MANAGEMENT_REQUIRED` rather than a bare `FORBIDDEN`.
- **`RoleManagement` set** — The only set in this file; wraps `assign:Role` so higher-level role definitions can reference the bundle by name.

## Relationships
- **`src/modules/access/module.ts`** — Implements the enforcement logic that reads this policy at request time and emits the `deniedCode` when the caller lacks the rule.
- **`src/modules/access/openapi.yaml`** — Documents the API endpoints (assign/revoke role, edit staff account) whose access control is governed by this file's rules.
- **`src/modules/account/module.ts`** — The module whose account mutations (edit, ban, erase) are gated by this rule when the target account holds a staff role.
- **`shared/scenarios/personas.yaml`** — Defines persona/role bundles that reference the `RoleManagement` set to grant the `assign:Role` permission to administrators in test and documentation scenarios.

## Notes
- The file intentionally contains **exactly one rule and one set**. A role is defined as "a bundle of permission sets and nothing else" — there is no numeric level or hierarchy.
- `stepUp: critical` means the authorization check demands a fresh authentication at the tier that mints the API key, not merely a valid token.
- The `deniedCode` (`ROLE_MANAGEMENT_REQUIRED`) is the canonical refusal string for every other staff-account mutation; keeping it consistent here avoids a second vocabulary.
- `credential: false` does not mean "no auth required"; it means no *additional* credential (beyond the authenticated caller) is needed for this action.
