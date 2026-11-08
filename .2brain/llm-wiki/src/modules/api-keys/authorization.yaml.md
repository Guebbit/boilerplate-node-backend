---
source: src/modules/api-keys/authorization.yaml
sha256: e528e82662254bd42808b01c87b2f4612c7e61a3b6b811523260712051c44d41
generated_at: 2026-11-08T05:01:24.244021+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/authorization.yaml

## Purpose

Declares the authorization policy for the `api-keys` module: which actions on the `ApiKey` subject are permitted, at what scope, under what credential constraints, and which require step-up authentication. The rules and rule-sets here gate every read, create, and delete operation on API keys within a tenant.

## Key elements

- **`rules`** — Three action entries for subject `ApiKey`, all scoped to `tenant`:
  - `read` — Lists a shop's machine-to-machine credentials. Marked `credential: false` (the caller does not present a credential to invoke it). Never exposes a key's secret.
  - `create` — Mints a new credential. Carries `stepUp: critical`, requiring re-authentication (analogous to GitHub's sudo mode) because a minted key outlives the issuing session. A minted credential can never exceed the minter's own permissions.
  - `delete` — Revokes a credential. Marked `credential: false`. Soft and immediate: the row becomes unreadable but is not hard-deleted.
- **`sets`** — Two named rule-set groupings that reference the rules above:
  - `ApiKeyDisplay` — bundles `read:ApiKey`.
  - `ApiKeyManagement` — bundles `create:ApiKey` and `delete:ApiKey`.

## Relationships

- **`src/modules/api-keys/module.ts`** — Every rule and set references `module: api-keys`, which is the runtime module implemented in this file. The authorization entries here are the policy layer that the module's handlers consult before executing an action.

## Notes

- `credential: false` on `read` and `delete` means those actions do not require the caller to present a valid credential; the `create` rule omits this flag, implying a credential **is** required to mint a new one.
- The `stepUp: critical` flag on `create` is the only step-up requirement in this file. Any UI or gateway consuming this policy must trigger re-authentication before allowing a key to be minted.
- `description` fields use YAML `>-` (folded) for multi-line text; the `create` rule's description includes an inline comment explaining the step-up rationale.
