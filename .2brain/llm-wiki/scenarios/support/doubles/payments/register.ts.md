---
source: scenarios/support/doubles/payments/register.ts
sha256: 9f5ddb3504a59ff6f47177f2e86d8e837984c9e091e975e738154cf5da40e03c
generated_at: 2026-11-08T02:34:30.365901+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/register.ts

## Purpose

Registers a lazy "fake" payment provider into the payments registry so that scenario tests can exercise the payments flow without a real PSP. Registration itself is a no-op cost: the fake implementation is only loaded (dynamic `import('./fake')`) the first time a method is actually called.

## Key elements

- **`registerDouble`** (exported) — Entry point. Calls `registerPaymentProvider` with the `lazyFakePaymentProvider` so the registry resolves the name `"fake"` to the lazy stand-in.
- **`lazyFakePaymentProvider`** (module-private) — An object satisfying the `PaymentProvider` interface. Every method (`prepare`, `confirm`, `retrieve`, `refund`, `retrieveRefund`, `listRefunds`, `cancel`, `parseWebhook`) dynamically imports `./fake` and delegates the call to the loaded real fake provider.
- **`loadFakePaymentProvider`** (module-private) — Wraps the dynamic `import('./fake')` and extracts `.fakePaymentProvider` from the module.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — The actual fake PSP implementation. Imported lazily at call time via `import('./fake')`; this file is its registration shim.
- **`src/modules/payments/providers/registry.ts`** — Source of `registerPaymentProvider`, which this file calls to insert the fake into the global registry.
- **`src/modules/payments/providers/index.ts`** — Source of the `PaymentProvider` type that both `lazyFakePaymentProvider` and the imported fake conform to.

## Notes

- The file lives in `scenarios/support/doubles/payments/` (its own folder, not directly under `doubles/`) so that the `demo:remove` script can delete the folder along with the `payments` group module. After deletion, `../modules.generated.ts` is rebuilt from the remaining folders and the double disappears cleanly.
- Each forwarded method reads the target method off the *loaded* object at call time (`provider.refund(...)`), rather than capturing a reference upfront. This means `jest.spyOn(fakePaymentProvider, 'refund')` on the real object in `./fake` still intercepts the call.
- The dynamic import is repeated on every call (not memoized in this file); caching is the responsibility of the module system.
