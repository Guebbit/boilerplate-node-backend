---
source: scenarios/support/doubles/register.ts
source_sha256: f44e8d6102cb5edd19c3729f257675375998ce453a3dd54e65b5ddf8ee63de0d
context_sha256: 601f7d8f2c034fdab8c9d1589e4e4d82dd6ac2d7583bd6c3c75fd12947617578
generated_at: 2026-11-22T01:48:26.463009+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/doubles/register.ts

## Purpose
Puts the test doubles into the registries the application resolves from, giving one list of what a dev, demo or test process fakes. It lives outside `src/`, so production never imports it. It is deliberately light: it loads only the registries, because both callers run before the application is built.

## Key elements
- `registerDoubles(): void` is the only export. It does four things:
  - calls `registerModuleDoubles()` (from `./modules.generated`);
  - registers the `log` mail transport (`logMailTransport`);
  - registers the `outbox` mail transport (`outboxMailTransport`);
  - calls `registerWebhookSinkExemption()`.
- It is safe to call more than once, because a registry entry is replaced, not duplicated.

## Relationships
- **`scenarios/support/development-doubles.ts`** calls it before the app serves, for dev and demo processes.
- **`tests/support/setup.ts`** calls it once per test file under jest.
- **`src/infrastructure/adapters/mail-transports.ts`** supplies `registerMailTransport`, the registry that receives the `log` and `outbox` transports. That module imports no `nodemailer`.
- **`./mail-log`** supplies `logMailTransport`. It loads `nodemailer` on its first send.
- **`./mail-outbox`** supplies `outboxMailTransport`.
- **`./webhook-sink`** supplies `registerWebhookSinkExemption`.

## Notes
- Keep this file's imports light. Both callers run before the app is built and before a test's `jest.mock` is hoisted. A double that pulled in the payments module here would break both.
- Doubles that need such a module must load it lazily, on their first call.
