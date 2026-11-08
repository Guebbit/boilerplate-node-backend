---
source: tests/support/journey-mail.ts
sha256: f00e3fe74f65973fdf0c570edd233add1732b417b2a67f9f8b0045f9a1772c44
generated_at: 2026-11-08T09:56:04.805585+00:00
model: ollama:qwen3.8:27b
---

# tests/support/journey-mail.ts

## Purpose

Provides lookup and polling helpers for the in-memory mail outbox used by journey (integration) tests. It lets a test assert *which* emails reached *which* recipient under *which* template, and wait for mail that is sent after the HTTP response (e.g. signup, reset links).

## Key elements

- **`useOutboxMail()`** — Sets `NODE_MAIL_TRANSPORT` to `'outbox'` and `NODE_RABBITMQ_ENABLED` to `'0'` so all mail lands in the in-memory outbox instead of a real broker. Intended for `beforeEach`.
- **`mailsTo(to, template)`** — Filters the outbox by recipient address and template name; returns the matching list (oldest first).
- **`waitForMail(to, template)`** — Polls via `eventually` until at least one matching mail exists, then returns the newest one. Throws if none arrives.

## Relationships

- **`scenarios/support/doubles/mail-outbox.ts`** — Source of `readDemoOutbox()` and the `DemoOutboxEmail` type; this file is the read-side API over that store.
- **`tests/support/environment.ts`** — Supplies `setEnvironment`, which `useOutboxMail` calls to flip the transport and disable RabbitMQ.
- **`tests/support/eventually.ts`** — Supplies the polling primitive that `waitForMail` uses to await async sends.
- **Journey tests** (e.g. `bought-returned-refunded`, `the-hold-that-was-never-paid`, `quiet-for-three-years`, `the-provider-disagrees`, `an-accounts-whole-security-life`) — Import these three exports to assert mail side-effects in their steps.

## Notes

- The outbox is **never cleared** between steps. A journey may assert "sent exactly once"; clearing would mask a duplicate send. Cross-test isolation relies on unique per-journey addresses rather than state reset.
- `useOutboxMail` must run in `beforeEach` so each case gets a clean override scope and the mail path stays inline (no broker).
- `waitForMail` reads the system clock through `eventually` for its deadline — **do not call it while a fake/frozen clock is active**, or it will hang or misbehave.
