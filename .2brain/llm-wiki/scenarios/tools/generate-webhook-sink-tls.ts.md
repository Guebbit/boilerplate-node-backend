---
source: scenarios/tools/generate-webhook-sink-tls.ts
source_sha256: f2c2af227e473a9e36d4fa79fcfe0dd1aebf65cd3af8a48416242debe6380241
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:49:45.135931+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/tools/generate-webhook-sink-tls.ts

## Purpose
An authoring-time script (`npm run scenario:tls`) that regenerates the TLS fixtures for the demo webhook sink. It builds a throwaway test CA and a leaf certificate signed by it, then writes three public PEM files into `scenarios/support/tls/`. Output is committed, so normal runs never need `openssl`. Remake it when the ten-year validity runs out.

## Key elements
- `TLS_DIRECTORY`: the destination, `../support/tls` relative to the script.
- `VALIDITY_DAYS`: `'3650'`, shared by the CA and the leaf.
- `LEAF_ALT_NAMES`: the leaf's SANs: `IP:127.0.0.1`, `DNS:localhost`, `DNS:webhook-tester-tls`.
- `CA_CONFIG`: openssl config for the CA. It is a critical `CA:TRUE, pathlen:0` root with `keyCertSign`/`cRLSign` usage. Name constraints limit it to `127.0.0.0/255.0.0.0`, `localhost` and `webhook-tester-tls`.
- `LEAF_CONFIG`: the leaf's CSR config and the `v3_leaf` extensions (`CA:FALSE`, `digitalSignature`, `serverAuth`, the SANs, CN `127.0.0.1`).
- `openssl(directory, argv)`: wraps `execFileSync('openssl', …)` with `cwd` set to the scratch directory and inherited stdio. It throws on a non-zero exit.
- `remake()`: the main routine, run at module load:
  1. Create a temp scratch directory and write `ca.cnf` and `leaf.cnf` into it.
  2. Generate an ECDSA P-256 CA key and a self-signed CA certificate (`req -x509`).
  3. Generate a leaf key and CSR, then sign the CSR with the CA (`x509 -req`, `-CAcreateserial`).
  4. Run `openssl verify -CAfile ca.pem -verify_ip 127.0.0.1 leaf.pem` as a sanity check.
  5. Copy out `webhook-sink-ca.pem`, `webhook-sink-cert.pem` and `webhook-sink-key.pem`.
  6. Remove the scratch directory in a `finally` block.

## Relationships
No dependency-graph neighbors. It is a standalone script that interacts only with the `openssl` CLI and the filesystem, and it writes the three PEM files into `scenarios/support/tls/`. Its header comment says to run `npm run sync:frontend` after remaking, because the frontend's Cypress sink serves the same pair.

## Notes
- The CA private key lives only in the scratch directory and is deleted afterwards, so no further certificates can be issued under that CA. The `finally` block ensures cleanup even if a step fails.
- The leaf private key (`webhook-sink-key.pem`) is committed on purpose. The CA's name constraints stop a trusted copy of the CA from vouching for real hosts.
- It needs the `openssl` CLI because `node:crypto` can't build X.509 certificates.
- It runs under `tsx` and uses `__dirname`, so it assumes CommonJS-style module semantics.
- The `copyFileSync` calls assume `scenarios/support/tls/` already exists. The script does not create it.
