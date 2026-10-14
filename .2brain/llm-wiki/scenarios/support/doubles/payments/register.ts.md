---
source: scenarios/support/doubles/payments/register.ts
sha256: 199a8b07f6793188fa5f670c4c31095aa95a2fd924572e3ba64c9d471508ca58
generated_at: 2026-10-14T07:04:44.525149+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/register.ts

## Purpose

Registers a **lazy** fake payment provider (PSP) into the payments registry for scenario tests. The fake implementation is never loaded at registration time; it is dynamically imported only when a provider method is actually invoked. This keeps the `payments` module out of the bundle unless a test opens a real intent.

## Key elements

- **`loadFakePaymentProvider`** (module-private) — dynamic `import('./fake')` that returns the `fakePaymentProvider` from the sibling module. Called inside every method of the lazy provider.
- **`lazyFakePaymentProvider`** (exported) — a `PaymentProvider` object whose methods (`prepare`, `confirm`, `retrieve`, `refund`, `cancel`, `parseWebhook`) each call `loadFakePaymentProvider()` and then forward the call to the resolved real fake. Method lookup happens on the loaded object at call time, preserving spy interception.
- **`registerPaymentDouble`** (exported) — calls `registerPaymentProvider('fake', lazyFakePaymentProvider)` to insert the lazy stand-in into the registry under the name `'fake'`.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — the actual fake implementation. Dynamically imported by `loadFakePaymentProvider`; never imported statically.
- **`scenarios/support/doubles/register.ts`** — the parent "register all doubles" file. It contains the single static import of `registerPaymentDouble` from this file and the corresponding call.
- **`src/modules/payments/providers/registry.ts`** — supplies `registerPaymentProvider`, the function `registerPaymentDouble` calls to insert the provider.
- **`src/modules/payments/providers/index.ts`** — supplies the `PaymentProvider` type that `lazyFakePaymentProvider` conforms to.

## Notes

- **Folder isolation is deliberate.** `payments` is a `group: shop` module, and the `demo:remove` script deletes the entire folder. Keeping `fake.ts` in its own sub-folder means the only residue in the parent `register.ts` after removal is the one import line and one call.
- **Spy-friendliness.** Each method reads the target off the resolved object at call time (e.g. `provider.refund(...)`) rather than capturing the reference at import time. This ensures `jest.spyOn(fakePaymentProvider, 'refund')` placed on the real object in `fake.ts` still intercepts calls routed through the lazy wrapper.
- **Repeated dynamic imports are harmless.** `loadFakePaymentProvider` is called on every method invocation, but the module system caches the Promise, so the module is evaluated only once.
