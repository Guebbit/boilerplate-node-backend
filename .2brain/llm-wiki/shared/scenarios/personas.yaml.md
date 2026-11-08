---
source: shared/scenarios/personas.yaml
sha256: fa17916fdcb55af5c80247b89f7243d96aedcf54647c771c5b2be81838937acb
generated_at: 2026-11-08T03:11:49.702710+00:00
model: ollama:qwen3.8:27b
---

# shared/scenarios/personas.yaml

## Purpose

Declares the 13 named demo login accounts—identities, credentials, role memberships, and initial state—used to seed a local/CI development profile. It exists so that every developer, the Cypress suite, and the generated documentation start from the same known set of personas without duplicating data.

## Key elements

- **`staffTotpSecret`** – A single Base32 (160-bit) TOTP secret shared by every account that has `authenticator: true`. Chosen once for simplicity; a demo fixture gains nothing from per-account secrets.
- **`accounts`** – A map of 13 named entries (`admin`, `user`, `editor`, `moderator`, `unverified`, `twoFactor`, `pendingEmail`, `banned`, `secondShopper`, `manager`, `warehouse`, `support`, `operator`). Each entry carries:
  - `email`, `username`, `defaultPassword` – login identity (passwords are public by design).
  - `memberships` – zero or more `{ scope: tenant|platform, role: <name> }` pairs referencing roles defined in `shared/authorization-roles.yaml`. Customers (`user`, `secondShopper`, etc.) hold an empty list; their effective role is *computed* from `state.verified`, never granted.
  - `state` – initial flags: `verified`, `active`, `twoFactor`, `authenticator`, `pendingEmail`, `analyticsConsent`.

## Relationships

- **`src/modules/access/authorization.yaml`** – The authorization module consumes the `memberships` and `state` fields here to decide whether a given persona may perform an action. The `verified` flag on customer accounts is the sole input the module uses to derive a customer's effective role; all other role checks resolve against the `role` names in `memberships` (themselves sourced from `shared/authorization-roles.yaml`).

## Notes

- Passwords are intentionally public. The demo profile never persists to a database reachable outside a developer or CI environment.
- Per-account password override: set `NODE_SEED_<NAME>_PASSWORD` (e.g. `NODE_SEED_ADMIN_PASSWORD`) to replace `defaultPassword` at seed time.
- The paired frontend's Cypress suite does **not** hard-code any credential; it fetches each login from the scenario description endpoint (`GET /__test/scenario`).
- The 10 filler customers (address books, images, etc.) are **not** in this file; they live in `scenarios/` code.
- `admin` is the only account with two memberships (tenant `admin` + platform `operator`), modelling a shop-owner-who-is-also-operations. `operator` is the inverse: platform-only, no tenant membership, so it holds none of a shop's keys.
- `banned` has `active: false`, meaning the authorization layer refuses every login attempt for that account.
- Generated reference tables in `docs/tools/demo-profile.md` are built by reading this file directly; keep the YAML schema stable when editing.
