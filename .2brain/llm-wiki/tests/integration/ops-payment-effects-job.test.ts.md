---
source: tests/integration/ops-payment-effects-job.test.ts
sha256: abb03add17caf2754a586a7f80ee1948ddfc27f235d5225e91387ab97b9c7853
generated_at: 2026-11-15T00:23:07.710332+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/ops-payment-effects-job.test.ts

## Purpose

Integration test that drives the `sweep:payment-effects` job through the same `prepareJob` / `runJobWork` path used by `npm run job`, verifying that a payment charged at the provider (but with no webhook delivered) is settled **and** the buyer-confirmation email is sent within that same run — not deferred to a separate `sweep:outbox` process.

## Key elements

- **`sweepPaymentEffects()`** — looks up the job entry named `sweep:payment-effects` in the `paymentsJobs` array; throws if missing.
- **`chargedAtProvider()`** — registers the payments module, creates a user/product/order, creates a payment intent, then confirms the payment via the fake provider. Immediately calls `resetDomainEvents()` and clears the email mock so the job run starts from a clean slate (simulating a fresh process).
- **Test: "mails the buyer in the same run…"** — runs the sweep with `NODE_PAYMENT_RECONCILE_MINUTES=0`, asserts exactly one `payments.payment-received` email was enqueued to the buyer's address.
- **Test: "sends nothing when the run settles nothing"** — runs the sweep with no outstanding payments, asserts `enqueueEmail` was never called.
- **Jest mock** — only `enqueueEmail` is replaced; buyer lookup and mail-body construction execute for real.

## Relationships

- **`scripts/ops/prepare-job.ts`** — provides `prepareJob` and `runJobWork`, the actual job-runner entry points under test.
- **`src/modules/payments/jobs.ts`** — exports `paymentsJobs`, the array from which the sweep job definition is retrieved by name.
- **`src/modules/payments/module.ts`** — `paymentsModule` is registered via `registerCheckoutModules` to wire the module into the test environment.
- **`src/modules/payments/services/index.ts`** — imported and used in test setup to create the payment intent.
- **`src/modules/payments/repository.ts`** — imported and used in test setup to retrieve the payment record for provider confirmation.
- **`scenarios/support/doubles/payments/fake.ts`** — provides the fake provider used in setup to simulate the provider-side charge.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the only mocked function; assertions target its calls.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-process event bus to model a fresh job process.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` injects `NODE_PAYMENT_RECONCILE_MINUTES=0` so the sweep has no minimum-age filter.
- **`tests/support/callers.ts`** — `asCustomer` builds the caller context for the payment intent creation.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the DI/test graph.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` prepares the test database before any test runs.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** — domain factories for test data creation.

## Notes

- The test intentionally calls `resetDomainEvents()` **after** the provider confirmation to guarantee the job run does not inherit events queued during setup — it must discover the unsettled payment on its own.
- `NODE_PAYMENT_RECONCILE_MINUTES` is set to `'0'` to bypass the "only reconcile payments older than N minutes" guard, ensuring the sweep picks up the payment immediately.
- The job is resolved by **name lookup** in the `paymentsJobs` array rather than a direct function import, mirroring how the ops runner discovers jobs at runtime.
- Only the *send* (transport) of the email is faked; the service that composes the mail body and resolves the recipient runs in full, so regressions in mail construction are caught here.
