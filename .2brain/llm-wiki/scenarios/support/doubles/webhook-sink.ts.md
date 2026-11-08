---
source: scenarios/support/doubles/webhook-sink.ts
sha256: c4a3f9441e9d55873c27b852276ce8d08e3b46524c02ea923b0c92f56e1c8880
generated_at: 2026-11-08T02:34:49.221928+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/webhook-sink.ts

## Purpose

Test double that registers an SSRF exemption and TLS trust for the demo webhook sink (a local `webhook-tester` proxy or a Cypress listener). Because the sink lives on loopback or a private compose address, the production SSRF guard would reject it; this file lets the dev preload script opt in without baking an exemption into production code. Never shipped.

## Key elements

- **`SINK_CA_PATH`** – Resolved path to `../tls/webhook-sink-ca.pem`, the committed test CA that signed the sink's leaf certificate.
- **`trustSinkCertificateAuthority()`** *(private)* – Reads the CA PEM, then **adds** it to the process's default TLS roots via `tls.setDefaultCACertificates([...defaults, pem])`. No-ops if the CA is already present (idempotent).
- **`registerWebhookSinkExemption()`** *(exported)* – Reads `NODE_WEBHOOK_DEMO_SINK_URL` from the config store. If set and parseable, registers the sink's full origin (scheme + host + port) via `registerSsrfExemptOrigin` and calls `trustSinkCertificateAuthority`. If the env var is unset or not a valid URL, the function is a no-op.

## Relationships

- **`src/infrastructure/adapters/ssrf-exemptions.ts`** – Provides `registerSsrfExemptOrigin`, which this file calls to whitelist the sink's origin.
- **`src/infrastructure/config/store.ts`** – Provides `currentEnvironment`, from which this file reads `NODE_WEBHOOK_DEMO_SINK_URL`.
- **`scenarios/support/doubles/register.ts`** – The caller that invokes `registerWebhookSinkExemption` during the dev preload phase.
- **`tests/unit/scenarios/webhook-sink.test.ts`** – Unit tests for this module.
- **`tests/support/webhook-receiver.ts`** – The sink-side receiver that this exemption is configured for.
- **`tests/integration/scenarios/webhooks-seed.test.ts`** – Integration scenario that exercises the sink end-to-end.

## Notes

- Requires **Node ≥ 24.5** for `tls.getCACertificates` and `tls.setDefaultCACertificates`.
- `trustSinkCertificateAuthority` intentionally **appends** to the existing default roots. Passing just `[pem]` would discard public CAs and break every other TLS connection (including `fetch`).
- The exempted origin is the full WHATWG origin (scheme, host, **and port**), so exempting `http://localhost:3070` does not open the rest of that host.
- The whole module is a no-op unless `NODE_WEBHOOK_DEMO_SINK_URL` is set and parseable — no sink, no exemption, no trust.
