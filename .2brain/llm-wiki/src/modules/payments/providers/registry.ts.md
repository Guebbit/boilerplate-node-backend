---
source: src/modules/payments/providers/registry.ts
source_sha256: 368abe3939aa369e7517aedea21ae37c085198a60af9a4e1b0641174b5eff879
context_sha256: abf44dca542981b278460c6647e34d07a9745553601ff1e1196d285635aa9574
generated_at: 2026-11-22T06:47:39.987709+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/providers/registry.ts

## Purpose
Holds the payment provider registry in its own file so a test double can register itself without loading the payments module. At runtime this file imports only the registry helper. `./index` would pull in the payments config chain (the config store, `ibantools`). Production registers nothing here: a real PSP adds its own file and one `registerPaymentProvider` call. The `fake` provider is a test double and lives in `scenarios/support/doubles/`.

## Key elements
- `paymentProviderRegistry`: a registry of `PaymentProvider` implementations, created with `createSharedProviderRegistry<PaymentProvider>('payments')`. It is shared across module instances, so a double registered at boot survives a module reset.
- `registerPaymentProvider(provider)`: registers or overrides (in a test) an implementation under `provider.name`, without editing any module file.

## Relationships
- `src/infrastructure/runtime/provider-registry.ts`: supplies `createSharedProviderRegistry`, the only runtime import.
- `src/modules/payments/providers/index.ts`: the source of the `PaymentProvider` type (type-only import, so there is no runtime load). The file is split out to avoid the runtime dependency on `./index`.
- `scenarios/support/doubles/payments/register.ts`: the test-double side. By the file's own description, doubles such as `fake` register through this registry.
- The other neighbors (`repository.ts`, the `services/` refund and settlement files, and the contract, integration and rate-limit tests) are related through the dependency graph. The file's content does not show how they interact with the registry.

## Notes
- The registration key is `provider.name`. That is the value `NODE_PAYMENT_PROVIDER` selects by and the value persisted on each payment, so the two cannot disagree.
- Registering under an existing name overrides it. The docs describe this as intended for tests.
- Keep this file free of runtime imports from `./index`. It is split out so doubles can register without the config chain.
