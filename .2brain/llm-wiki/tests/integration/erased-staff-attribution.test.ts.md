---
source: tests/integration/erased-staff-attribution.test.ts
sha256: 7a57f53caf09ec5d488ade284962cd3f91b5e4cf6821e81c84ee0b49203c2107
generated_at: 2026-11-08T09:38:26.758576+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/erased-staff-attribution.test.ts

## Purpose

Integration test verifying that erasing a staff user leaves the domain records they created (webhook subscriptions, translations, buyer purchase holds) intact but with all back-references to the user nulled out. It exercises the real purge cascade rather than mocking it, ensuring the "dangling reference" invariant holds across multiple modules.

## Key elements

- **`setupTestDb()`** – provisions an isolated test database before the suite runs.
- **`registerCheckoutModules([webhooksModule, localesModule])`** (in `beforeEach`) – wires the two modules under test into the runtime container.
- **`resetDomainEvents()`** (in `afterEach`) – clears the in-memory domain-event bus so tests don't leak events.
- **`describe('erasing a staff account')`** – three `it` blocks, each following the pattern: create staff → create an owned artifact → call `eraseAsScheduled(staff)` → assert the artifact still exists and the user reference is `undefined`.
  - Webhook subscription: `ownerUserId` is cleared; the subscription row and its ring secret survive.
  - Translation: `translatedBy` is cleared; the field content and `TranslationOrigin.human` origin survive.
  - Purchase hold: `setBy` is cleared; `reason` and `until` on the buyer's `purchaseHold` survive.

## Relationships

- **`tests/support/setup-test-db.ts`** – provides `setupTestDb` for DB lifecycle.
- **`tests/support/checkout-modules.ts`** – provides `registerCheckoutModules` to install module graphs per test.
- **`tests/support/callers.ts`** – exports `TEST_TENANT_ID` used as the tenant scope for created records.
- **`src/modules/users/tests/factories.ts`** – exports `createUser`, `eraseAsScheduled`, and `userRepository`; the erase call here is the "purge door" the doc comment refers to.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` creates and re-fetches the subscription record.
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` generates a valid secret entry for the subscription fixture.
- **`src/modules/locales/repository.ts`** – `translationRepository` upserts and re-fetches the translation row.
- **`src/modules/locales/module.ts`** / **`src/modules/webhooks/module.ts`** – registered so their event handlers and repository bindings are active during the cascade.
- **`src/kernel/events.ts`** – `resetDomainEvents` prevents cross-test event leakage.
- **`src/types/index.ts`** – `TranslationOrigin` enum used when writing the translation fixture.
- **`src/modules/users/repository.ts`** – `userRepository.findById` confirms the buyer's hold persists post-erase.

## Notes

- The file tests *attribution removal*, not record deletion. The invariant is: the artifact lives on, the user pointer goes to `undefined`.
- `eraseAsScheduled` (from the users test factories) is the single entry point that triggers the cross-module cascade; there is no separate "purge" call in this file.
- Each test asserts `toBeUndefined()` rather than `toBeNull()`—the convention in this codebase is that cleared references become `undefined`, not `null`.
- The webhook test checks that `secrets` are not asserted on after erase (only the owner field matters); the secret's integrity is out of scope here.
