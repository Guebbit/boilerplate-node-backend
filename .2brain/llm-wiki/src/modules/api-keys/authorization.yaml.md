---
source: src/modules/api-keys/authorization.yaml
source_sha256: e528e82662254bd42808b01c87b2f4612c7e61a3b6b811523260712051c44d41
context_sha256: 038a00278a09f46009b75c5c045b17ef8ae34d10756e52d696c9ab5385f0b279
generated_at: 2026-11-22T04:20:21.545414+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/authorization.yaml

## Purpose
Declares the authorization rules and rule sets for the `api-keys` module. It defines which actions can be performed on the `ApiKey` subject (machine-to-machine credentials for a shop) and groups those actions into named sets for display and management.

## Key elements
- **`rules`**: three tenant-scoped rules on subject `ApiKey`, module `api-keys`:
  - `read:ApiKey` – lists the shop's credentials; never returns a key's secret. `credential: false`.
  - `create:ApiKey` – mints a credential. Has its own floor: a credential can never hold a permission the minter lacks. Requires `stepUp: critical`.
  - `delete:ApiKey` – revokes a credential. Soft and immediate; the row stays readable. `credential: false`.
- **`sets`**:
  - `ApiKeyDisplay` – contains `read:ApiKey`.
  - `ApiKeyManagement` – contains `create:ApiKey` and `delete:ApiKey`.

## Relationships
- Sits next to `src/modules/api-keys/openapi.yaml`, which describes the module's API surface. This file defines the permissions for the same module. The content shown does not reference the OpenAPI file directly.

## Notes
- `credential: false` appears on `read` and `delete` but not on `create`. The file does not explain the field. It presumably controls whether the action is available to API-key credentials, so treat that reading as unconfirmed.
- `create` carries `stepUp: critical`. The comment says a minted credential outlives the session that made it, so a stolen access token that could mint one would turn short-lived access into a long-lived key.
- `ApiKeyManagement` has no read rule. Granting read access requires `ApiKeyDisplay` as well.
