---
source: scenarios/support/doubles/webhook-sink.ts
source_sha256: d5caf69ab08486179746a0a1ce0ad8896e90ec5548f7cb8b0e44fb8e7ea89beb
context_sha256: b112d49a43a0792d40842e34e4ef57f5e7afa6acac8fd3688d82a68451c75c2a
generated_at: 2026-11-22T01:48:32.761695+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/doubles/webhook-sink.ts

## Purpose
A test double (never shipped) that makes the demo webhook sink reachable and trusted by a process running the development doubles. The sink sits on loopback or a private compose address, which the SSRF guard normally refuses. This file registers the sink's origin as an SSRF exemption and adds the sink's test CA to the process's trusted TLS roots. Production code therefore carries no exemption of its own.

## Key elements
- `registerWebhookSinkExemption()` (exported): reads `NODE_WEBHOOK_DEMO_SINK_URL` from `currentEnvironment()`, trims it, and returns silently if it is unset or not a parseable URL. Otherwise it calls `registerSsrfExemptOrigin(new URL(sinkUrl).origin)` and then `trustSinkCertificateAuthority()`.
- `trustSinkCertificateAuthority()` (internal): reads the committed PEM at `../tls/webhook-sink-ca.pem` (`SINK_CA_PATH`, relative to `__dirname`). It gets the current roots with `tls.getCACertificates('default')`, returns early if the CA is already present, and otherwise calls `tls.setDefaultCACertificates([...defaults, pem])`.
- `SINK_CA_PATH`: path to the committed test CA that signed the sink's leaf certificate.

## Relationships
- `./register` (`register.ts`) calls `registerWebhookSinkExemption`.
- `@infrastructure/adapters/ssrf-exemptions` provides `registerSsrfExemptOrigin`, which records the exempt origin.
- `@infrastructure/config/store` provides `currentEnvironment()`, the source of `NODE_WEBHOOK_DEMO_SINK_URL`.
- `tests/unit/scenarios/webhook-sink.test.ts` unit-tests this module.
- `tests/integration/scenarios/webhooks-seed.test.ts` and `tests/support/webhook-receiver.ts` are neighbors in the graph, but nothing in the file shows how they interact with it.

## Notes
- The exemption covers the whole origin, port included. A sink on `:3070` does not exempt the rest of that host.
- The exemption and the CA trust are tied together: with no sink configured, neither is applied. No launcher needs to set `NODE_EXTRA_CA_CERTS`.
- The CA is appended to the defaults. Passing a bare `[pem]` would drop the public roots and break other TLS calls.
- The trust change is process-wide and applies to later TLS connections, including `fetch`.
- `tls.getCACertificates` and `tls.setDefaultCACertificates` require Node >= 24.5.
- Repeat calls do not add the CA twice, because of the already-present check.
