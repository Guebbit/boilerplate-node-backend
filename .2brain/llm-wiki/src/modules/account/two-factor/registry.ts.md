---
source: src/modules/account/two-factor/registry.ts
source_sha256: 714f0b3c200ef353045493fd998b14a4c01a1d1fb81b1ea6d31b50e1cdd19977
context_sha256: 2594f677710af392e2629810b511576ff22f9abba4803c5bfa1e58f6b4cc51e3
generated_at: 2026-11-22T04:11:53.659941+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/registry.ts

## Purpose
Defines the set of second-factor methods this deployment can run and the `TwoFactorMethodHandler` interface each one implements. Services, controllers and the contract deal only in a `method` string and a handler looked up from it, so adding a channel means adding a handler here rather than branching in the login flow.

## Key elements
- `MethodEligibility`: `{ enrollable, reason? }`. Says whether an account may add a method now, with a translated reason when it may not.
- `TwoFactorMethodHandler`: the per-method interface.
  - `name`: wire name.
  - `delivers`: true if the server sends the code, false if the caller reads it off their own device.
  - `available()`: whether the deployment can run the method at all.
  - `eligibility(user)`: whether this account may enroll it.
  - `target(user)`: masked destination, `undefined` for device methods.
  - `setup(user, entry, context)`: begins enrollment and returns a `TwoFactorSetup`.
  - `verify(user, entry, code)`: checks a typed code.
  - `send?(user, entry, context)`: delivers a fresh code and returns a `TwoFactorDelivery`. It is present exactly when `delivers` is true.
- `HANDLERS` (private): `[totpMethod, emailMethod]`, in the order clients should offer them. The device method (TOTP) comes first.
- `availableTwoFactorMethods()`: the handlers whose `available()` returns true.
- `twoFactorMethod(name)`: looks up an available handler by wire name. An unknown method and an unavailable one both return `undefined`.
- `orderedEntries(entries)`: pairs a user's stored `twoFactorMethods` entries with their handlers in `HANDLERS` order. Entries with no available handler are dropped.

## Relationships
- `src/modules/account/metrics.ts` supplies `authTwoFactorDisableTotal`, which this file initialises at module load.
- `src/modules/users/index.ts` supplies the `UserDocument` and `TwoFactorMethodRecord` types that handlers operate on.
- `@types` supplies `CallerContext`, `TwoFactorSetup` and `TwoFactorDelivery`.

## Notes
- Handlers mutate the entry they are given and never touch the database. The calling service persists once, covering the factor, backup codes and account flag together.
- Delivered methods get a cooldown, an expiry and an attempt ceiling. Device methods get a replay guard instead.
- At import time, `authTwoFactorDisableTotal` is incremented by 0 for every `method` (`all` plus each handler name) and each `status` (`success`, `failure`). This makes the series exist from startup so the failure alert sees the first failure after a restart.
- `defaultMethod` on a login challenge is the first armed method in `HANDLERS` order.
- `twoFactorMethod` deliberately returns the same answer for an unknown and an unavailable method, so callers cannot tell that a channel exists but is switched off.
