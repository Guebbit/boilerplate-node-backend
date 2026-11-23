---
source: shared/scenarios/personas.yaml
source_sha256: a759bf30bb55e5210798b877c6cc26ef9c4273329c3e72adc0d23886d95cc2cf
context_sha256: 59f37f8a87126cb3770810221d63e765ddbff5afde332773d63d9ce2d7887274
generated_at: 2026-11-22T02:28:44.755918+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/scenarios/personas.yaml

## Purpose
Declares the 13 demo login accounts: who each is, which roles it holds, and what state it starts in (verified, active, 2FA, etc.). Ids, images, address books and the 10 filler customers are deliberately not here; they stay in `scenarios/` code. Passwords are public on purpose, since the demo profile's database is only visible to developers or CI. The frontend's Cypress suite reads logins from the scenario description (`GET /__test/scenario`) instead of keeping its own copy.

## Key elements
- `staffTotpSecret`: one Base32 (160-bit) secret shared by every authenticator-enabled account.
- `accounts`: map keyed by persona name. Each entry has `email`, `username`, `defaultPassword`, `memberships`, and `state`.
- `memberships`: list of `{ scope, role }` pairs. Scopes seen are `tenant` and `platform`. An empty list means a plain customer.
- `state` flags:
  - `verified`: the address is proven, so there is no verify-your-email nag.
  - `active`: `false` means an admin switched the account off, and every login is refused.
  - `twoFactor`: email 2FA is armed, with five known single-use backup codes.
  - `authenticator`: an authenticator app is armed with `staffTotpSecret`.
  - `pendingEmail`: an unconfirmed address change, or `null`.
  - `analyticsConsent`: opted in to analytics.
- Personas:
  - `admin` (`root@root.it`): holds both `tenant/admin` and `platform/operator`.
  - `operator`: `platform/operator` only.
  - `editor`, `moderator`, `manager`, `warehouse`, `support`: one `tenant` role each, all with an authenticator.
  - `user` (`customer@example.com`): plain customer, the only account with `analyticsConsent: true`. The cart analytics journey logs in as it.
  - `unverified`: `verified: false`.
  - `twoFactor`: `twoFactor: true`.
  - `pendingEmail`: has a pending address change to `pending-new-address@example.com`.
  - `banned`: `active: false`.
  - `secondShopper`: a second plain customer.

## Relationships
- `shared/rules/authorization-roles.yaml`: every membership's `role` must name a role defined there. Customers have no membership, because that role is computed from `verified` rather than granted.

## Notes
- Passwords follow the pattern `Demo-<Name>1!`. `NODE_SEED_<NAME>_PASSWORD` overrides a password per account.
- A staff role grants nothing without an armed authenticator, which is why every staff persona has `authenticator: true`.
- Every authenticator shares the same secret, by design.
