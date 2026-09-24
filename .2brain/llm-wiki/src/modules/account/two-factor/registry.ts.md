---
source: src/modules/account/two-factor/registry.ts
sha256: 546fe9e0e6194b67f9a6b73ad7019eae280bf90a6e4d9fb30585d1e7d83831cf
generated_at: 2026-09-23T18:19:05.851975+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/registry.ts

## Purpose

Defines the handler contract for two-factor authentication methods and registers the concrete handlers this deployment ships (TOTP, email). Upper layers (services, controllers) reference methods only by a wire-name string and look the handler up here, so adding a new channel means adding a handler in this file rather than branching the login flow.

## Key elements

- **`TwoFactorMethodHandler`** (interface) — the contract every method handler must satisfy: `name`, `delivers`, `available()`, `eligibility()`, `target()`, `setup()`, `verify()`, and optional `send()`. Handlers mutate the `TwoFactorMethodRecord` they receive but never persist; the calling service performs the single save.
- **`MethodEligibility`** (interface) — `{ enrollable, reason? }` returned by `eligibility()` to gate per-account enrollment.
- **`HANDLERS`** (module-private constant) — ordered array `[totpMethod, emailMethod]`. Order is the order a client should offer methods (cheapest/round-trip-free first); the first armed method becomes `defaultMethod` on a login challenge.
- **`availableTwoFactorMethods()`** — filters `HANDLERS` to those whose `available()` returns true.
- **`twoFactorMethod(name)`** — looks up a single handler by wire name among available handlers; returns `undefined` for both unknown *and* unavailable names (deliberate: no information leak about disabled channels).
- **`orderedEntries(entries)`** — re-orders a user's stored `TwoFactorMethodRecord[]` to match `HANDLERS` order, pairing each with its handler and dropping entries with no matching handler.

## Relationships

- **`./methods/totp.ts` / `./methods/email.ts`** — the two concrete handlers imported and placed in `HANDLERS`. This file is their sole registration point.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — provides `CallerContext`, `TwoFactorDelivery`, `TwoFactorSetup` used in the handler signatures.
- **`src/modules/users/index.ts` / `src/modules/users/model.ts`** — provides `TwoFactorMethodRecord` and `UserDocument`, the data shapes every handler method receives.
- **`src/modules/account/two-factor/index.ts`** — barrel file that re-exports this module's public surface to the rest of the codebase.
- **`src/modules/account/services/two-factor.ts`** — the consuming service that calls `twoFactorMethod()`, `orderedEntries()`, and the handler methods (`setup`, `verify`, `send`) and then persists the mutated entry.

## Notes

- Handlers **never write to the database**. They mutate the `TwoFactorMethodRecord` in place; the calling service performs one combined save covering the factor, backup codes, and the account flag.
- `twoFactorMethod` intentionally conflates "unknown method" with "method exists but is unavailable" — both return `undefined` so a caller cannot probe which channels are configured.
- `send` is optional on the handler and is present **exactly** when `delivers` is `true`. Device methods (e.g. TOTP) do not implement it.
- The order in `HANDLERS` is load-bearing for UX (offer order, default method selection) and for `orderedEntries`.
