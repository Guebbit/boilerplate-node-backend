---
source: tests/unit/scenarios/webhook-sink-tls.test.ts
sha256: 10e9a5f16cfa8c6ea000ae3a588ebea83d6542e26e79bdf3568fc7497f048bed
generated_at: 2026-11-08T10:31:16.421145+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/webhook-sink-tls.test.ts

## Purpose

Verifies the committed TLS fixtures (CA, leaf certificate, private key) used by the demo webhook sink. It asserts chain-of-trust structure, SAN coverage, a 30-day expiry runway, and — via a real HTTPS handshake — that a client which does not trust the test CA is refused. The complement to this file is `webhook-sink.test.ts`, which exercises the trusting path.

## Key elements

- **`ca` / `cert` / `key`** – The three PEM fixtures read once from `scenarios/support/tls/` at module load.
- **`RENEWAL_WINDOW_MS`** – 30-day buffer; both the CA and leaf must outlive it or the test fails, forcing a remake before expiry.
- **`CLIENT_SCRIPT`** – An inline Node one-liner that performs `fetch` and writes either the status code or `refused:<reason>` to stdout.
- **`startSink()` / `stopSink()`** – Start/stop an `https.createServer` bound to `127.0.0.1:0` with the leaf; answers `200 {}` to every request.
- **`callFromFreshProcess(url)`** – Spawns a child Node process (`node -e CLIENT_SCRIPT <url>`) with `NODE_EXTRA_CA_CERTS` cleared, ensuring no ambient trust leaks in.
- **`describe('the demo webhook sink fixtures')`** – Four tests: (1) leaf signed by CA and CA is a proper CA; (2) SAN covers `127.0.0.1`, `localhost`, `webhook-tester-tls` and nothing else; (3) both certs expire later than now + 30 days; (4) untrusted client sees `refused:`.

## Relationships

The dependency graph lists no neighbors for this file. The module doc comment references two companions:

- `scenarios/support/tls/` – the fixture directory the test reads from.
- `scenarios/tools/generate-webhook-sink-tls.ts` – the script that (re)generates the fixtures when the 30-day window test starts failing.
- `webhook-sink.test.ts` – exercises the same sink with a client that *does* trust the CA.

## Notes

- The "refused" test deliberately spawns a **separate** Node process rather than using the test runner's TLS stack, so no `NODE_EXTRA_CA_CERTS` or global agent settings can silently make the test pass.
- The fixtures are committed to the repo; there is no runtime generation. When the 30-day expiry test fails, the intended fix is to run the generator script and commit the new PEMs — not to extend the window.
- `TLS_DIRECTORY` is resolved relative to `__dirname`, so the test must remain at its current path depth (three levels above `scenarios/support/tls/`) unless the constant is updated.
