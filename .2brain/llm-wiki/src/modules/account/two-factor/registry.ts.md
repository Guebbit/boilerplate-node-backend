---
source: src/modules/account/two-factor/registry.ts
sha256: 76b2716785782e957f566f35b83ab8194ed7700ad2adce842d3eb19e2e2f5803
generated_at: 2026-11-08T04:53:05.573876+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/registry.ts

## Purpose

Defines the set of second-factor methods this deployment supports and the handler contract each must satisfy. It exists so that adding a new 2FA channel means registering a handler here rather than branching inside the login or verification flow; all upper-layer services resolve a method by wire-name string against this registry.

## Key elements

- **`TwoFactorMethodHandler`** — interface every method implements. Distinguishes *delivered* methods (server sends a code; gets cooldown, expiry, attempt ceiling) from *device* methods (caller reads locally; gets a replay guard). Key members: `name`, `delivers`, `available()`, `eligibility()`, `target()`, `setup()`, `verify()`, and optional `send()`.
- **`MethodEligibility`** — `{ enrollable, reason? }` shape returned by `eligibility()` to tell the UI whether and why enrollment is blocked.
- **`HANDLERS`** — ordered `readonly` array `[totpMethod, emailMethod]`. Order is the order a client should present methods (device-first, then delivered).
- **`availableTwoFactorMethods()`** — filters `HANDLERS` through each handler's `available()` check.
- **`twoFactorMethod(name)`** — resolves a wire-name string to a handler. Returns `undefined` for both unknown and unavailable names deliberately, so a caller cannot distinguish the two.
- **`orderedEntries(entries)`** — re-orders a user's stored `twoFactorMethodRecord` array to match `HANDLERS` order, pairing each with its handler; drops entries whose method name has no registered handler.
- **Prometheus pre-seed loop** — at module load, increments `authTwoFactorDisableTotal` by 0 for every method name (`'all'` plus each handler) in both `success` and `failure` states so the metric exists immediately after a restart.

## Relationships

- **`./methods/totp.ts` / `./methods/email.ts`** — imported as the two concrete `TwoFactorMethodHandler` implementations registered in `HANDLERS`.
- **`../metrics`** — supplies `authTwoFactorDisableTotal`, a Prometheus counter used for the pre-seed loop and (presumably) incremented by the disable path in the services layer.
- **`@modules/users`** — provides the `UserDocument` and `TwoFactorMethodRecord` types used throughout the handler interface.
- **`./index.ts`** — barrel re-export; downstream consumers import the registry's public API through this file.
- **`../services/two-factor-enrollment.ts`, `../services/two-factor-lockout.ts`, `../services/two-factor-outcomes.ts`** — call the handler methods (`setup`, `verify`, `send`, `eligibility`) via the exports from this registry.
- **`../tests/unit/two-factor.test.ts`** — exercises the registry's lookup, ordering, and availability-filtering logic.

## Notes

- Handlers **mutate** the `TwoFactorMethodRecord` entry passed to them but **never write to the database** directly; the calling service performs the single persist that covers the method entry, backup codes, and the account flag together.
- `twoFactorMethod` intentionally collapses "unknown method" and "method is off" into the same `undefined` return so the API never reveals that a channel exists but is disabled.
- The `HANDLERS` array order is load-bearing: `defaultMethod` on a login challenge is the first armed entry in this order, and `orderedEntries` preserves it for the client's display sequence.
- The Prometheus pre-seed includes a synthetic `'all'` label that does not correspond to any real handler; it represents the aggregate disable operation and must be kept in sync with whatever emits the `'all'` counter.
