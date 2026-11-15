---
source: shared/scenarios/personas.yaml
sha256: 941ab53235d8b670e1fb298a8cda795653e11c03fd2426c53112d779fc61205d
generated_at: 2026-11-14T17:47:17.323173+00:00
model: ollama:qwen3.8:27b
---

# shared/scenarios/personas.yaml

## Purpose

Defines the 13 demo login accounts for the demo profile: who they are (email, username), what they may do (role memberships), and what state they start in (verification, 2FA, consent flags, etc.). It is a seed fixture consumed by the demo backend and its paired Cypress suite; it never feeds a production database.

## Key elements

- **`staffTotpSecret`** — A single Base32 (160-bit) TOTP secret shared by every account that has `authenticator: true`. Deliberately one value for all accounts; a demo fixture gains no security benefit from per-account secrets.
- **`accounts`** — A map of 13 named accounts (`admin`, `user`, `editor`, `moderator`, `unverified`, `twoFactor`, `pendingEmail`, `banned`, `secondShopper`, `manager`, `warehouse`, `support`, `operator`). Each entry contains:
  - `email`, `username`, `defaultPassword` — identity and login credentials (passwords are intentionally public).
  - `memberships` — zero or more `{ scope: tenant|platform, role: … }` grants. Customer-type accounts hold an empty list.
  - `state` — Flags: `verified`, `active`, `twoFactor`, `authenticator`, `pendingEmail`, `analyticsConsent`.

## Relationships

- **`src/modules/access/authorization.yaml`** — The role names referenced in each account's `memberships` are defined in this file. A customer account's effective permission is *not* a membership; it is derived at runtime from the `verified` state flag, as governed by the authorization module.

## Notes

- **Password override:** Each account's password can be replaced per-environment via the `NODE_SEED_<NAME>_PASSWORD` env var (e.g. `NODE_SEED_ADMIN_PASSWORD`).
- **Cypress coupling:** The paired frontend's Cypress suite retrieves each login from the scenario description (`GET /__test/scenario`) and stores no local copy of credentials.
- **Shared TOTP secret:** All seven authenticator-armed accounts use the same `staffTotpSecret`. If you add a new authenticator account, it inherits that secret automatically.
- **Customer vs. staff:** Customer accounts (`user`, `unverified`, `twoFactor`, `pendingEmail`, `banned`, `secondShopper`) have `memberships: []`. Their effective role is *computed* from `verified`, never explicitly granted.
- **Dual-role admin:** The `admin` account holds two memberships (tenant `admin` + platform `operator`) because it is both shop owner and installation operator.
- **Platform-only operator:** The `operator` account has only a platform-scope membership and no tenant membership, so it holds none of a shop's keys.
- **Filler customers not here:** The 10 additional filler customer accounts and their address books live in `scenarios/` code, not in this file.
