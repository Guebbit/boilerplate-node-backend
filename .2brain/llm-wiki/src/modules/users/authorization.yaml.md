---
source: src/modules/users/authorization.yaml
sha256: ce027dfa528cb11d9eb46b129cd5f6d0517e7283d916f71a54af15011045aa8f
generated_at: 2026-11-14T22:19:01.988586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/authorization.yaml

## Purpose

Declares the authorization keys and named permission sets for the `users` module. Every rule is scoped to `tenant` and governs actions on **other** people's `User` records (self-service actions live under `account`, not here). It exists so that role definitions and API gates can reference stable, human-readable permission names instead of ad-hoc strings.

## Key elements

- **`rules`** — Five individual permission entries, each an `action:Subject` pair tied to the `users` module at `tenant` scope:
  - `read:User` — view another tenant member's profile.
  - `create:User` — provision a new account for someone else.
  - `update:User` — mutate profile fields (username, image, locale, phone, website). Explicitly **excludes** credentials, `active`, and role assignment.
  - `ban:User` — deactivate/reactivate an account or pause/unpause a checkout.
  - `delete:User` — permanently erase an account. Carries `stepUp: critical`, requiring re-authentication before the action can proceed.
- **`sets`** — Five named groupings (`UserDisplay`, `UserCreation`, `UserEditing`, `UserBanning`, `UserErasure`), each wrapping the corresponding single rule. Sets give role/permission assignments a stable reference point that can grow without breaking consumers.

## Relationships

- **`src/modules/users/module.ts`** — The module entry point that this file belongs to. The `module: users` tag on every rule and set is what binds them to that module at load time.
- **`src/modules/users/openapi.yaml`** — The OpenAPI spec for the users endpoints. Each rule here corresponds to an API operation; the spec's `security` references (or the middleware that enforces them) resolve back to these keys and sets.

## Notes

- **Self vs. other.** The `read` rule's description explicitly notes that reading *your own* account is `account`, not a key in this file. Do not grant `read:User` to a regular user expecting self-service.
- **`stepUp: critical` on `delete`.** This is the only rule with a step-up requirement. Any auth middleware must check for and enforce re-authentication before honoring `delete:User`; a stale session token is not sufficient.
- **`update` is a whitelist by exclusion.** The description enumerates what is allowed; anything not listed (credentials, `active`, role) is out of scope. Role changes go through a separate `assign:Role` key.
- **`ban` is bidirectional.** A single key covers both deactivating *and* reactivating, as well as pausing *and* unpausing. The actor does not need a second key to undo their own ban.
