---
source: tests/support/journey-mail.ts
sha256: f00e3fe74f65973fdf0c570edd233add1732b417b2a67f9f8b0045f9a1772c44
generated_at: 2026-10-29T07:08:52.345982+00:00
model: ollama:qwen3.8:27b
---

# tests/support/journey-mail.ts

## Purpose

Provides mail-reading helpers for journey (integration) tests. It reads the in-memory outbox to assert which emails a journey produced, by recipient and template, without clearing between steps so that accidental duplicate sends remain visible.

## Key elements

- **`useOutboxMail()`** – Sets `NODE_MAIL_TRANSPORT` to `'outbox'` and `NODE_RABBITMQ_ENABLED` to `'0'` via `setEnvironment`. Called in `beforeEach` so each case gets a clean transport override.
- **`mailsTo(to, template)`** – Returns every outbox entry matching the recipient and template name, oldest first (`.toReversed()`).
- **`waitForMail(to, template)`** – Polls via `eventually` until at least one matching entry exists, then returns the newest one. Throws if none ever arrives.

## Relationships

- **`scenarios/support/doubles/mail-outbox.ts`** – Source of `readDemoOutbox` (the actual in-memory store) and the `DemoOutboxEmail` type used throughout.
- **`tests/support/environment.ts`** – Supplies `setEnvironment`, which `useOutboxMail` calls to flip the transport and disable RabbitMQ.
- **`tests/support/eventually.ts`** – Supplies the `eventually` polling primitive used inside `waitForMail`.
- **Journey test files** (`an-accounts-whole-security-life`, `bought-returned-refunded`, `quiet-for-three-years`, `the-hold-that-was-never-paid`, `the-provider-disagrees`) – Import `useOutboxMail`, `mailsTo`, and/or `waitForMail` to assert mail side-effects.

## Notes

- The outbox is **never cleared** between steps within a journey. This is deliberate: clearing would mask a second (duplicate) send. Cross-journey contamination is avoided because each journey uses unique addresses.
- `mailsTo` returns **oldest first**; `waitForMail` returns the **newest** (last element). Be aware of the direction difference when asserting content.
- Do **not** call `waitForMail` while the virtual clock is frozen — `eventually` reads the clock to compute its deadline and will hang or misbehave.
- Mail in these journeys is dispatched **after** the HTTP response returns, which is why polling (`waitForMail`) exists rather than a single synchronous read.
