---
source: docker/mongo-entrypoint.sh
sha256: c3ee9ea4059fbe2e2773661c322bb571be5a4e89dd61c5b49886538c00ac7f5e
generated_at: 2026-09-23T17:12:29.793507+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-entrypoint.sh

## Purpose

Bash wrapper that runs as root before the official MongoDB image's `docker-entrypoint.sh` drops privileges to the `mongodb` user (uid 999). It guarantees the replica-set keyFile and wire-TLS certificate/key pair exist with correct permissions and ownership, then hands off to the real entrypoint. Using a single in-container wrapper (rather than a separate one-shot compose service) avoids a podman-compose/libpod dependency-chain bug where any container two levels below an already-exited one-shot fails to start.

## Key elements

- **`set -euo pipefail`** — strict error handling for the whole script.
- **KeyFile block (`/keyfile-dir/mongo-keyfile`)** — generates a 756-byte base64 random key, `chmod 400`, `chown 999:999`. Skipped if the file already exists and is non-empty.
- **Self-signed CA + server PEM block (`/keyfile-dir/`)** — first-boot-only (skipped when `SERVER_PEM` exists). Mints an RSA-4096 CA (`-nodes`, 10-year validity), then issues a server certificate with SAN `DNS:database, DNS:localhost, IP:127.0.0.1`. Concatenates key + cert into a single `mongo-server.pem` for `--tlsCertificateKeyFile`. Cleans up `/tmp` intermediates.
- **Shared CA copy (`/ca-dir/mongo-ca.crt`)** — copies the public CA cert (only) into a volume shared with `app`/`cron`/`setup`/`mongo-rs-init` so they can verify the server without exposing private keys. Re-copied every boot for idempotency.
- **`exec docker-entrypoint.sh "$@"`** — final hand-off; preserves `exec` so mongod becomes PID 1 of the process and receives signals directly.

## Relationships

No graph neighbors are tracked for this file. It does reference, in comments only, `docker-compose.production.yml` (reads `$SERVER_PEM`), `DB_SECURITY_1_WIRE_TLS.md` (security option rationale), `docs/tools/backups.md` (dump command), and the `mongo-rs-init` service (connects via loopback). The script writes to two Docker volumes: `/keyfile-dir` (persisted, MongoDB-owned) and `/ca-dir` (shared read-only CA cert).

## Notes

- Runs as **root** by design — it needs `chown` to uid 999, which the `mongodb` user cannot do. The real `docker-entrypoint.sh` re-drops privileges via `gosu` after this script exits.
- The CA key (`mongo-ca.key`) and server key are **unencrypted** (`-nodes`) because no human is present at boot to supply a passphrase; the same rationale applies to the keyFile having no password.
- `SERVER_PEM` format is **key then cert** (not cert then key) to match MongoDB's `--tlsCertificateKeyFile` expectation — the script `cat`s key first, cert second.
- TLS is **one-way** (server presents cert; client verifies). No `--tlsCAFile` on the mongod side, so the server does not request a client certificate (no mTLS). See `DB_SECURITY_1_WIRE_TLS.md` for the Option A vs C discussion.
- To use a real CA-issued cert instead: pre-place `SERVER_PEM` (cert+key concatenated) and `CA_CERT` in `/keyfile-dir/` before first boot; the generation block is then skipped.
- The SAN includes `DNS:database` (the compose service name other containers dial) **and** `DNS:localhost`/`IP:127.0.0.1` (in-container `mongosh`/`mongodump` calls over loopback).
