---
source: src/modules/account/tests/unit/operator-identity.test.ts
source_sha256: ba51ffe4e6c610886aa0d56601ef19d8a490706f366d0ea4b6b20166bc0a7f19
context_sha256: 7489a2aedab068ff9b80410bb1a6e487f73258d49ab02d136309db62287545ab
generated_at: 2026-11-22T04:07:21.002251+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/operator-identity.test.ts

## Purpose
Unit tests for the operator's legal identity, which is read live from `NODE_LEGAL_*` environment variables. They cover two things: the `operatorIdentity()` service, and the boot gate that refuses to start when a required field is missing. The tests only read environment variables, so a unit suite is enough.

## Key elements
- `REQUIRED`: a map of the five required variables (`NODE_LEGAL_NAME`, `NODE_LEGAL_STREET`, `NODE_LEGAL_CITY`, `NODE_LEGAL_ZIP`, `NODE_LEGAL_COUNTRY`), each with a valid sample value.
- `REQUIRED_VARIABLES`: the keys of `REQUIRED`, cast to a typed key array.
- `withoutEnvironmentInThisFile([...])`: clears the required variables plus the optional ones (`NODE_LEGAL_PHONE`, `NODE_LEGAL_VAT_NUMBER`, `NODE_LEGAL_TRADE_REGISTER`, `NODE_LEGAL_REGISTRATION_NUMBER`, `NODE_LEGAL_EMAIL`, and `NODE_SUPPORT_EMAIL`) for this file.
- `describe('the operator boot gate')`:
  - A parameterised test unsets each required variable in turn. It expects `assertModuleConfig([accountModule], [])` to throw an error mentioning that variable's name.
  - A second test checks that boot works without a phone number, so the error does not match `/NODE_LEGAL/`.
- `describe('operatorIdentity')`:
  - With only the required fields set, the result contains exactly those fields plus `email`, which comes from `NODE_SUPPORT_EMAIL`. The optional keys are left out.
  - With the optional fields set, `phone`, `vatNumber`, `tradeRegister` and `registrationNumber` are carried through. `NODE_LEGAL_EMAIL` takes precedence over the support address.
  - With a required field unset (`NODE_LEGAL_CITY`), `operatorIdentity()` throws rather than return an empty notice.

## Relationships
- `src/kernel/module-config.ts` supplies `assertModuleConfig`, which runs the boot checks.
- `src/modules/account/module.ts` is the account module passed to `assertModuleConfig`. Its env requirements are what the tests exercise.
- `src/modules/account/services/index.ts` re-exports `operatorIdentity`, which is implemented in `src/modules/account/services/operator-identity.ts`.
- `tests/support/environment.ts` supplies `setEnvironment` and `withoutEnvironmentInThisFile`, which manage the environment variables per test.

## Notes
- `assertModuleConfig` short-circuits under `NODE_ENV=test`. Each boot-gate test therefore sets `NODE_ENV: 'development'` first.
- Setting a variable to `undefined` through `setEnvironment` is how the tests simulate it being unset.
