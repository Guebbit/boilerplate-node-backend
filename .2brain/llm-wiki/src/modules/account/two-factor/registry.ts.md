---
source: src/modules/account/two-factor/registry.ts
sha256: 76b2716785782e957f566f35b83ab8194ed7700ad2adce842d3eb19e2e2f5803
generated_at: 2026-10-14T14:50:23.487139+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/registry.ts

## Purpose
Central registry of the second-factor methods this deployment supports. It defines the `TwoFactorMethodHandler` contract, registers the concrete handlers (TOTP, email), and provides lookup and ordering utilities so that services and the login flow address a method by wire-name string rather than branching on a specific channel. Adding a new 2FA channel means adding a handler here, not touching the login flow.

## Key elements
- **`MethodEligibility`** — interface: `enrollable: boolean` plus an optional translated `reason` shown to the user when enrollment is refused.
- **`TwoFactorMethodHandler`** — the per-method contract. Key members: `name` (wire string), `delivers` (server-push vs. device-read), `available()`, `eligibility(user)`, `target(user)`, `setup()`, `verify()`, and optional `send()` (present only when `delivers` is true). Handlers mutate the `TwoFactorMethodRecord` entry they are handed; they never touch the database.
- **`HANDLERS`** — module-level `readonly` array `[totpMethod, emailMethod]`. Order is the client-offer order and determines the `defaultMethod` on a login challenge (TOTP first, because it is device-based and costs no round-trip).
- **`availableTwoFactorMethods()`** — filters `HANDLERS` to those whose `available()` returns true.
- **`twoFactorMethod(name)`** — looks up a single handler by wire name; returns `undefined` for both unknown *and* unavailable names by design.
- **`orderedEntries(entries)`** — re-orders a user's stored `TwoFactorMethodRecord[]` into `HANDLERS` order, pairing each with its handler; entries with no matching handler are silently dropped.
- **Module-level side effect** — pre-seeds `authTwoFactorDisableTotal` (Prometheus counter) to zero for every method name plus `'all'` and both `'success'`/`'failure'` statuses, so the first real failure after a restart is alertable.

## Relationships
- **`./methods/totp.ts`**, **`./methods/email.ts`** — imports the two concrete handlers and registers them in `HANDLERS`.
- **`../metrics.ts`** — imports `authTwoFactorDisableTotal`; the registry pre-seeds it at load time.
- **`@modules/users`** (`src/modules/users/index.ts`) — imports `UserDocument` and `TwoFactorMethodRecord` types used throughout the handler interface and ordering utility.
- **`./index.ts`** — barrel re-exports the public API of this module to the rest of the account feature.
- **`services/two-factor-enrollment.ts`**, **`services/two-factor-lockout.ts`**, **`services/two-factor-outcomes.ts`**, **`services/reauth.ts`** — consume `twoFactorMethod()`, `availableTwoFactorMethods()`, and `orderedEntries()` to resolve a handler and delegate `setup`/`verify`/`send` calls.
- **`tests/unit/two-factor.test.ts`** — unit-tests the registry's lookup and ordering behaviour.

## Notes
- **Order is semantic.** The position in `HANDLERS` controls client offer order and the login `defaultMethod`. Inserting a new handler is an ordering decision, not just an addition.
- **`twoFactorMethod()` hides availability.** An unknown name and an unavailable name both return `undefined`; a caller cannot distinguish "this channel doesn't exist" from "it exists but is off." This is intentional.
- **Handlers are stateless w.r.t. persistence.** They mutate the in-memory `TwoFactorMethodRecord` they receive; the calling service owns the single save that writes the method entry, backup codes, and the account flag atomically.
- **`send` is optional on the interface.** It is only present when `delivers` is true. Device methods (TOTP) omit it.
- **Importing this module has a side effect.** The `for` loop that seeds Prometheus counters executes at module load, so any import (including the barrel `./index.ts`) triggers it.
- **`orderedEntries` can silently drop a user's method.** If a stored entry's `method` string matches no available handler (e.g. the channel was disabled post-deployment), that entry is excluded from the result with no error or log.
