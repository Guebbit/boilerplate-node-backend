---
source: scenarios/tools/generate-webhook-sink-tls.ts
sha256: 6f717efeea0baf5cd3068b695ff33cb7e87f9c79c1e41dbf26fa6124376c8e67
generated_at: 2026-11-08T02:35:39.927599+00:00
model: ollama:qwen3.8:27b
---

# scenarios/tools/generate-webhook-sink-tls.ts

## Purpose

One-shot authoring script (run via `npm run scenario:tls`) that regenerates the demo webhook sink's TLS fixture pair — a test CA and a leaf certificate — and commits them to `scenarios/support/tls/`. It exists so the fixtures can be rebuilt when the ten-year validity expires without needing a human to run raw `openssl` commands.

## Key elements

- **`TLS_DIRECTORY`** — Resolved path to `scenarios/support/tls/`, the commit destination for the three PEM files.
- **`CA_CONFIG` / `LEAF_CONFIG`** — Inline `openssl` config strings. The CA is path-length-0 with `nameConstraints` restricted to `127.0.0.0/8`, `localhost`, and `webhook-tester-tls`. The leaf is `CA:FALSE`, `serverAuth`, with SANs `IP:127.0.0.1, DNS:localhost, DNS:webhook-tester-tls`.
- **`openssl(directory, argv)`** — Thin wrapper around `execFileSync('openssl', …)` scoped to a working directory.
- **`remake()`** — Generates an ECDSA P-256 CA key, self-signs the CA, generates a leaf key, signs a CSR with the CA, verifies the chain against `127.0.0.1`, copies the three public PEMs into `TLS_DIRECTORY`, then deletes the scratch directory (destroying the CA private key). Runs in a `mkdtempSync` scratch dir; cleanup is in `finally`.
- **Top-level call** — The script executes `remake()` immediately on import; it is not a library.

## Relationships

No dependency-graph neighbors are recorded for this file. It is a standalone CLI tool whose *output* is consumed by:

- `scenarios/support/tls/` (the three committed PEM fixtures).
- `tests/unit/scenarios/webhook-sink-tls.test.ts` (asserts the fixtures are still valid; fails ~1 month before expiry).
- The frontend Cypress sink, which serves the same cert/key pair (synced via `npm run sync:frontend`).

## Notes

- **`openssl` is required at author time only.** The script shells out to the `openssl` binary; the generated PEMs are committed, so normal runs never need it.
- **The CA private key never leaves the scratch dir.** It is generated, used to sign the leaf once, and destroyed with `rmSync`. Only the CA *certificate*, leaf cert, and leaf key are kept.
- **The leaf private key is committed on purpose** (it is a loopback demo key, not a secret).
- **After regenerating, run `npm run sync:frontend`** so the frontend's Cypress sink picks up the new pair.
- The script uses `__dirname` to resolve the output path, so it must be run as a file (via `tsx`), not imported as a module.
