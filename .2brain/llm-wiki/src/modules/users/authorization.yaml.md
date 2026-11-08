---
source: src/modules/users/authorization.yaml
sha256: ef1e621d79ab7ac2e1f7078d802b9380c2d0fdd1d48a66c0077658b9d4e4bc4b
generated_at: 2026-11-08T08:43:30.957351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/authorization.yaml

## Purpose
Declares the tenant-scoped authorization rules and named permission sets for the `users` module. It defines which actions a tenant actor may perform on *other* users (as opposed to their own account, which uses the `account` scope) and groups those rules into reusable sets that the rest of the system checks at runtime.

## Key elements
- **`rules`** — Five individual permission rules, all `scope: tenant`, all `subject: User`:
  - `read:User` – view another user's profile.
  - `create:User` – provision a new account.
  - `update:User` – modify profile fields (username, image, locale, phone, website, role). Role changes additionally require the `assign:Role` holder; credentials and the `active` flag are explicitly excluded.
  - `ban:User` – deactivate/re-activate an account or pause/unpause checkout.
  - `delete:User` – irreversibly erase an account. Flagged `stepUp: critical`, requiring an extra authentication step before the action is allowed.
- **`sets`** — Five named permission sets, each wrapping exactly one rule:
  - `UserDisplay` → `read:User`
  - `UserCreation` → `create:User`
  - `UserEditing` → `update:User`
  - `UserBanning` → `ban:User`
  - `UserErasure` → `delete:User`

## Relationships
- **`src/modules/users/module.ts`** – The module entry point that loads or references this authorization file, making the rules and sets available to the users module's request pipeline.
- **`src/modules/users/openapi.yaml`** – The OpenAPI spec for the users endpoints; its security/scheme definitions reference the named permission sets (e.g. `UserDisplay`, `UserErasure`) to gate each operation.

## Notes
- **Tenant vs. account scope.** Every rule here is `scope: tenant`. Actions on *your own* account live under the `account` scope elsewhere; they are intentionally not listed here.
- **`stepUp: critical` on `delete`.** The only rule with a step-up requirement. Consumers of the authorization layer must trigger a re-authentication (e.g. re-enter password, 2FA) before permitting a `delete:User` call; a stale session token alone is insufficient.
- **`update` is not a catch-all.** The description explicitly carves out credentials and the `active` flag; those are governed by other rules (e.g. `ban` for activation) and must not be folded into `update:User`.
- **Sets are 1:1 with rules** in this file. If a rule is added, a corresponding set (or an addition to an existing set) is expected so that `openapi.yaml` and `module.ts` can reference it by name.
