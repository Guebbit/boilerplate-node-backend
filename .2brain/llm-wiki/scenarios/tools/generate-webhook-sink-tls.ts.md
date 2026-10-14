---
source: scenarios/tools/generate-webhook-sink-tls.ts
sha256: 6f717efeea0baf5cd3068b695ff33cb7e87f9c79c1e41dbf26fa6124376c8e67
generated_at: 2026-10-14T07:06:21.180643+00:00
model: ollama:qwen3.8:27b
---

# scenarios/tools/generate-webhook-sink-tls.ts

## Purpose

One-shot authoring script that regenerates the TLS fixtures for the demo webhook sink (CA cert, leaf cert, leaf key) into `scenarios/support/tls/`. It exists because Node's `node:crypto` cannot build X.509 certificates, so it shells out to `openssl` at author time; the resulting PEM files are committed, so no runtime dependency on `openssl` remains.

## Key elements

- **`TLS_DIRECTORY`** – Resolves to `scenarios/support/tls/`, the destination for the three committed PEM files.
- **`VALIDITY_DAYS`** – `'3650'` (ten years); shared by both CA and leaf.
- **`CA_CONFIG`** – Inline `openssl` config for the self-signed root: `pathlen:0`, `keyCertSign` only, and `nameConstraints` restricting it to `127.0.0.0/8`, `localhost`, and `webhook-tester-tls`.
- **`LEAF_CONFIG`** – Inline `openssl` config for the leaf: `serverAuth` EKU, SAN of `IP:127.0.0.1, DNS:localhost, DNS:webhook-tester-tls`.
- **`openssl(directory, argv)`** – Thin wrapper around `execFileSync('openssl', …)` with `stdio: 'inherit'`.
- **`remake()`** – Core logic: creates a `mkdtempSync` scratch dir, generates an ECDSA P-256 CA key + self-signed CA cert, generates a leaf key + CSR, signs the CSR with the CA, runs `openssl verify` against loopback, copies the three public PEMs into `TLS_DIRECTORY`, then (in `finally`) deletes the scratch dir—destroying the CA private key with it.
- **Top-level `remake()` call + `console.info`** – The script is invoked directly (`npm run scenario:tls`), not imported.

## Relationships

No graph neighbors are registered. The file's doc-comment references two downstream consumers:

- `tests/unit/scenarios/webhook-sink-tls.test.ts` – expected to fail one month before the 10-year validity expires, signalling it's time to re-run this script.
- The frontend Cypress sink (synced via `npm run sync:frontend`) – serves the same leaf cert/key pair.

## Notes

- The **CA private key is never persisted**. It lives only inside the `mkdtempSync` scratch directory and is deleted in `finally`, so no one can mint additional certificates under this CA.
- The **leaf private key is committed on purpose** (`webhook-sink-key.pem`); the doc-comment flags this as intentional for the demo context.
- The CA is **name-constrained** to loopback and two specific hostnames, limiting blast radius even if the CA cert leaks.
- `openssl verify … -verify_ip 127.0.0.1` is run *before* copying files out; if the chain or IP SAN is wrong the script aborts (non-zero exit from `execFileSync`) and the destination directory is untouched.
- Regeneration is a manual, rare step (every ~10 years); the test acts as the expiration alarm.
