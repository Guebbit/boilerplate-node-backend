---
source: docker/mongo-entrypoint.sh
sha256: 55d1f2513967a3d5a31aa6a30e60bea9951f7ebe4ad70d72087dcadaea0fc7f5
generated_at: 2026-10-07T23:47:47.810483+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-entrypoint.sh

## Purpose

Wrapper around the official MongoDB image's `docker-entrypoint.sh` that guarantees the replica-set keyFile and wire-TLS certificates exist (with correct ownership) before mongod starts. It replaces an earlier one-shot Compose service because podman-compose 1.6 / libpod refuses to start containers that transitively depend on an already-exited container; wrapping the entrypoint avoids that dependency chain entirely.

## Key elements

- **KeyFile generation** — If `/keyfile-dir/mongo-keyfile` is missing or empty, generates a 756-byte base64 random key, sets mode `400`, and chowns to `999:999` (the `mongodb` user).
- **Self-signed TLS bootstrap** — If `/keyfile-dir/mongo-server.pem` is absent, mints a 10-year root CA (`mongo-ca.key` / `mongo-ca.crt`), then a server key + cert signed by that CA with SANs `DNS:database, DNS:localhost, IP:127.0.0.1`. The final PEM is **key-then-cert** concatenated (MongoDB's `--tlsCertificateKeyFile` format).
- **Shared CA distribution** — Copies `mongo-ca.crt` to `/ca-dir/mongo-ca.crt` (re-copied every boot, idempotent) so client containers verify the server without ever seeing `/keyfile-dir`.
- **`exec docker-entrypoint.sh "$@"`** — Hands off to the upstream entrypoint; the script never returns on its own.

## Relationships

No graph neighbors are registered for this file.

## Notes

- **Privilege window**: The script runs as root (the container's default user) *before* `gosu` drops to uid 999. It needs that root to `chown 999:999`; the upstream entrypoint is the one that actually de-privileges.
- **First-boot-only guards**: Both the keyFile and TLS blocks are gated on `[ ! -s "$FILE" ]`. A deployment with real CA-issued certs simply pre-populates `$SERVER_PEM` and `$CA_CERT` on the volume; the script will skip generation.
- **No key passphrase**: `-nodes` is used everywhere because no human is present at boot to re-enter a passphrase.
- **Client-side TLS only**: mongod runs with `--tlsAllowConnectionsWithoutCertificates`; the CA cert is the only secret shared with `app`, `cron`, `setup`, and `mongo-rs-init` containers. The private keys never leave `/keyfile-dir`.
- **SAN coverage**: `localhost` / `127.0.0.1` are included so in-container `mongosh` / `mongodump` calls (healthcheck, `mongo-rs-init`, backup tooling) that connect over loopback still pass certificate verification.
