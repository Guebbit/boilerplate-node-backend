---
source: tests/integration/ops-outbox-sweep-job.test.ts
sha256: 47390e8970c9c2beaedb863da8932d7995af609fe135987c57f5fc2ce2c285f3
generated_at: 2026-11-15T00:22:36.071372+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/ops-outbox-sweep-job.test.ts

## Purpose

Integration test for the `sweep:outbox` backstop job, driven exactly the way `npm run job` drives it (via `prepareJob` / `runJobWork`). It verifies that the backstop correctly builds and sends the buyer's email from a still-pending outbox row, resolving the admin's edited copy and the fallback language when the buyer's own locale has been deactivated.

## Key elements

- **`settledWithRowPending(locale)`** – Helper that creates a user, product, order, and card payment, then forcibly reverts every outbox row to `pending` (simulating a crash between commit and relay). Also calls `resetDomainEvents()` to model a fresh backstop process.
- **`sweepOutbox()`** – Looks up the `sweep:outbox` entry from `appJobs`; throws if undeclared.
- **`paymentReceivedMails()`** – Filters `mockEnqueueEmail` calls to only those for the `payments.payment-received` template.
- **Test cases (4):**
  - Admin-edited subject line is used in the sent mail; the outbox row transitions to `published`.
  - When the buyer's locale is deactivated, the fallback language's default subject is used.
  - `prepareJob()` registers mail templates so an inline cron send can render them.
  - A relay failure causes `runJobWork` to reject, letting the runner record the failure.

## Relationships

- **`scripts/ops/prepare-job.ts`** – Provides `prepareJob` (installs all job wiring) and `runJobWork` (executes a single job's `run`). The test asserts it drives the job identically to production.
- **`src/app/jobs.ts`** – Source of the `appJobs` array; the test looks up `sweep:outbox` by name.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is used to patch rows to `pending` and to assert the final `published` status; `settleOutboxNudges` advances retry scheduling before the test reverts rows.
- **`src/kernel/events.ts`** – `resetDomainEvents` clears the in-memory event bus to simulate a fresh process.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is the single mock point; the build path (copy lookup, template name resolution) is exercised for real.
- **`src/infrastructure/adapters/template-registry.ts`** – `registerTemplateDirectories` / `registeredTemplateNames` are used to verify `prepareJob` re-registers templates.
- **`src/infrastructure/i18n/index.ts`** – `registerLocaleOverrideProvider` / `resetLocaleOverrides` reset i18n state between tests.
- **`src/infrastructure/i18n/overrides.ts`** – Provides the override-reset helpers used in `afterEach`.
- **`src/modules/locales/repository.ts`** – The test imports `localeEntryRepository` to seed an admin-edited translation key for the target locale.
- **`src/modules/locales/apps.ts`** – `backendApp` identifies the app scope for locale entries.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale` creates/enables locale records.
- **`src/modules/orders/index.ts`** – The test imports `orderService` to build the order fixture.
- **`src/modules/orders/services/index.ts`** – Backing service layer exercised when the order is created.
- **`src/modules/payments/module.ts`** – Registered via `registerCheckoutModules` so the payment flow is available.
- **`src/modules/payments/tests/factories.ts`** – `payByCard` settles the payment, producing the pending outbox row the backstop must relay.

## Notes

- Jest globally preloads translation dictionaries and template files for every suite, so a "missing dictionary" scenario cannot be reproduced here. The template-registration test works around this by calling `registerTemplateDirectories([])` to empty the registry, then asserting `prepareJob` repopulates it.
- Only the *send* (`enqueueEmail`) is mocked; copy resolution, template-name lookup, and i18n fallback all execute for real.
- The "crash" is simulated by overwriting **all** outbox rows to `pending` with `nextAttemptAt: new Date(0)` *after* `settleOutboxNudges`, then resetting the domain-event bus—modeling the backstop as a separate process that inherits only the DB state.
