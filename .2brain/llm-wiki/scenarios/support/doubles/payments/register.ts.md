---
source: scenarios/support/doubles/payments/register.ts
sha256: 9f5ddb3504a59ff6f47177f2e86d8e837984c9e091e975e738154cf5da40e03c
generated_at: 2026-10-29T01:27:25.597584+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/payments/register.ts

## Purpose

Registers a lazy stand-in for the fake Payment Provider (PSP) in the payments registry. Because it uses a dynamic import, registering costs nothing at startup; the real fake (`./fake`) is only read once a method is actually invoked. The file lives in its own `payments/` subfolder so that the `demo:remove` command can delete the entire `payments` group folder without breaking unrelated doubles.

## Key elements

- **`loadFakePaymentProvider()`** (module-private) — Dynamic `import('./fake')` that resolves to `fakePaymentProvider`. Called once per method invocation until the module is cached.
- **`lazyFakePaymentProvider`** (module-private) — A `PaymentProvider` object whose every method (`prepare`, `confirm`, `retrieve`, `refund`, `retrieveRefund`, `listRefunds`, `cancel`, `parseWebhook`) forwards to the real fake after the lazy load. Reads the method off the loaded object at call time.
- **`registerDouble()`** (named export) — Calls `registerPaymentProvider(lazyFakePaymentProvider)` to install the stand-in under the name `'fake'`.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — The actual fake implementation, loaded lazily via `import('./fake')` inside `loadFakePaymentProvider`.
- **`src/modules/payments/providers/registry.ts`** — Provides `registerPaymentProvider`, the single call inside `registerDouble` that puts the stand-in into the registry.
- **`src/modules/payments/providers/index.ts`** — Source of the `PaymentProvider` type used to type-annotate the lazy object and the loader's return.
- **`scenarios/support/doubles/modules.generated.ts`** — Rebuilt from the folders that remain after `demo:remove`; deleting this file's parent folder removes the `payments` double from the generated module list.

## Notes

- **Spy-friendliness:** Because each method resolves `provider.<method>` from the freshly imported object at call time, `jest.spyOn(fakePaymentProvider, 'refund')` on the real object still intercepts the forwarded call. A static binding captured at registration time would break this.
- **Folder placement is intentional.** The file sits in `scenarios/support/doubles/payments/` (not directly under `doubles/`) because `payments` is tagged `group: shop`; `demo:remove` deletes the whole folder, and the generated modules file is then rebuilt from whatever folders remain.
- The module has no default export—only the named `registerDouble`—and is marked `@module` (side-effect import).
