---
source: scenarios/support/doubles/payments/register.ts
generated_at: 2026-11-22T01:48:17.235725+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/doubles/payments/register.ts

## Purpose
Registers the fake payment service provider (PSP) in the payments registry as a lazy stand-in. Registering loads nothing. The real fake in `./fake` is imported only when something first opens an intent. It sits in its own folder alongside `./fake` because `payments` is a `group: shop` module and `demo:remove` deletes the folder with it. A generated modules file (`../modules.generated.ts`, per the file's own doc comment) is then rebuilt from the folders that remain.

## Key elements
- `registerDouble()` (exported): calls `registerPaymentProvider` with the lazy provider, so the fake is registered under the name `fake`.
- `lazyFakePaymentProvider` (module-private): a `PaymentProvider` named `'fake'`. Each method forwards to the real fake provider once it has loaded. The methods are `prepare`, `confirm`, `retrieve`, `refund`, `retrieveRefund`, `listRefunds`, `cancel` and `parseWebhook`. Each returns a promise.
- `loadFakePaymentProvider()` (module-private): runs `import('./fake')` and resolves to its `fakePaymentProvider` export.

## Relationships
- `./fake` (`scenarios/support/doubles/payments/fake.ts`): the real fake PSP. It is loaded dynamically and only on first use. This file never imports it statically.
- `src/modules/payments/providers/registry.ts`: provides `registerPaymentProvider`, which `registerDouble` uses to add the provider.
- `src/modules/payments/providers/index.ts`: provides the `PaymentProvider` type that the lazy wrapper implements. It is a type-only import.

## Notes
- Each forwarding method reads the method off the loaded provider at call time. A test's `jest.spyOn(fakePaymentProvider, 'refund')` on the real object therefore still intercepts calls made through the registry.
- `loadFakePaymentProvider()` calls `import('./fake')` on every method call and does not cache the provider itself. This relies on the module system to cache the module after the first load.
