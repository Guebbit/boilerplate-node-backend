---
source: src/modules/orders/tests/unit/notify.test.ts
sha256: 093154781dad6a1225f56486c7a1ea986620d7d296235e422a19a4bace5b5b68
generated_at: 2026-10-29T04:59:23.696350+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/notify.test.ts

## Purpose

Unit tests for the `mailBuyer` buyer-mail **policy** (the decision logic in `services/notify.ts`): whether an email is sent at all, which name is used as the greeting, and how a failed user-lookup is handled. Mail content and template rendering are intentionally **out of scope** here — the module doc notes those are pinned by listener/integration tests.

## Key elements

- **`orderFixture(overrides?)`** — builds a type-safe `OrderDocument` stub (via `asStub`) with a default card-order shape; every test case starts from this.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a module-level `enqueueEmailMock` so the tests can assert "was an email queued?" without hitting a real transport.
- **`describe('mailBuyer — anonymised order')`** — verifies that an order whose email is `ANONYMIZED_EMAIL` triggers **no** build and **no** enqueue, and a normal order still triggers `build` with the real address.
- **`describe('mailBuyer — buyer lookup fails')`** — spies on `userService.getById` to reject, then asserts the fallback name equals the order email and that `logger.error` is called with a structured context (`orderId`, `error`).
- **`build` (injected `jest.fn()`)** — passed as the second argument to `mailBuyer`; the test never imports a real builder, keeping the test focused on policy rather than template output.

## Relationships

- **`src/modules/orders/services/notify.ts`** — the unit under test (`mailBuyer`). The test calls it directly with a fixture order and a mock builder.
- **`src/modules/orders/domain/anonymization.ts`** — provides the `ANONYMIZED_EMAIL` sentinel used to drive the "send nothing" branch.
- **`src/modules/orders/model.ts`** — supplies the `OrderDocument` type that `orderFixture` and `asStub` are constrained to.
- **`src/modules/users/index.ts`** → **`src/modules/users/services/index.ts`** — source of `userService.getById`; the test spies on it to simulate a lookup failure.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is spied on to verify the structured log call on lookup failure.
- **`tests/support/stub.ts`** — `asStub` gives the fixture a minimal type cast so the object satisfies `OrderDocument` without constructing a full Mongoose doc.

## Notes

- The `build` function is **injected** as a parameter to `mailBuyer`; it is not imported from any module. This means the test validates the *call contract* (arguments, invocation) but not the template output.
- `enqueueEmail` is mocked at the **module** level (`jest.mock`), while `userService.getById` and `logger.error` are spied on per-test. Mixing the two patterns is intentional: the mailer is never touched in the anonymized path, so a module-level mock makes the absence assertion trivial.
- The doc comment explicitly scopes this file: "The mails themselves are pinned by the listener tests beside the flows that send them." Don't add template-content assertions here.
