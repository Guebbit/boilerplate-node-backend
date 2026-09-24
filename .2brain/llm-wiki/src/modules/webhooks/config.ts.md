---
source: src/modules/webhooks/config.ts
sha256: e6f176f1110e48e088ef0e50d561188ef7215d95f3ae133d4f73ba7e6266addb
generated_at: 2026-09-23T19:38:21.362411+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/config.ts

## Purpose

Env-derived configuration accessors for the webhooks module. Every value is read at call time (not captured at import) so a deployment can change limits or keys without restarting the process. This mirrors the pattern set by `inventory/config.ts`.

## Key elements

- **`getWebhookEncryptionKeyRing()`** — Parses `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` via `parseVersionedKeyRing` and returns a `VersionedKey[]` for webhook payload encryption/decryption.
- **`getWebhookSubscriptionCap()`** — Returns the per-tenant subscription limit (env `NODE_WEBHOOK_SUBSCRIPTION_CAP`, default 20, min 1). Acts as the fan-out guard: one event × N subscriptions = N deliveries, so an unbounded count is an unbounded cost.
- **`getWebhookDemoAllowedHost()`** — Returns the hostname (or `undefined`) exempt from the SSRF guard's `https:` / public-address requirement. Only active under `NODE_ENV` of `development` or `test` **and** when `NODE_WEBHOOK_DEMO_SINK_URL` is set. Intended for the `webhook-tester` compose service (plain HTTP, private network).

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — Supplies `environmentNumber`, the typed env-reader used by `getWebhookSubscriptionCap`.
- **`src/infrastructure/security/versioned-secret.ts`** — Supplies `parseVersionedKeyRing` and the `VersionedKey` type consumed by `getWebhookEncryptionKeyRing`.
- **`src/modules/webhooks/services/subscriptions.ts`** — Primary consumer of `getWebhookSubscriptionCap`: checks the cap against a per-tenant count before every create and again by insertion rank after (to close the race at the boundary).

## Notes

- **Per-call reads are intentional.** Do not "optimise" these into module-level constants; the whole point is that a config change takes effect on the next request.
- **`getWebhookDemoAllowedHost` is a second gate.** `src/kernel/required-config.ts` already refuses to boot in production with `NODE_WEBHOOK_DEMO_SINK_URL` set. The `NODE_ENV` check here is a belt-and-suspenders guard for any `NODE_ENV` value that boot-time validation doesn't cover.
- **Malformed `NODE_WEBHOOK_DEMO_SINK_URL` silently yields `undefined`** (no SSRF exemption). The `try/catch` around `new URL(...)` is deliberate — a bad URL means "no exemption," not a crash. An eslint-disable suppresses the `no-restricted-syntax` rule because `URL` has no non-throwing constructor.
