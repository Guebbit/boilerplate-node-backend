---
source: docker/mongo-entrypoint.sh
sha256: 55d1f2513967a3d5a31aa6a30e60bea9951f7ebe4ad70d72087dcadaea0fc7f5
generated_at: 2026-11-08T02:20:36.880949+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-entrypoint.sh

## Purpose

Wrapper entrypoint for the MongoDB container that generates replica-set keyFile and wire-TLS material (self-signed CA + server certificate) on first boot, with correct ownership, before handing off to the official image's `docker-entrypoint.sh`. Replaces an earlier one-shot service approach that broke podman-compose 1.6/libpod's dependency resolution.

## Key elements

- **KeyFile generation** — `openssl rand -base64 756` written to `/keyfile-dir/mongo-keyfile`; guarded by `[ ! -s … ]` so it runs once. `chmod 400`, `chown 999:999`.
- **CA creation** — Self-signed 10-year RSA-4096 root CA (`/keyfile-dir/mongo-ca.key` / `.crt`), unencrypted key (`-nodes`). First-boot only.
- **Server PEM creation** — RSA-4096 key + CSR (SAN: `DNS:database, DNS:localhost, IP:127.0.0.1`), signed by the CA above, then concatenated (key then cert) into `/keyfile-dir/mongo-server.pem`. Temp files in `/tmp` are removed.
- **CA cert sharing** — Copies `mongo-ca.crt` to `/ca-dir/mongo-ca.crt` every boot (idempotent) so `app`/`cron`/`setup`/`mongo-rs-init` can verify mongod's identity without access to the private keys in `/keyfile-dir`.
- **Final handoff** — `exec docker-entrypoint.sh "$@"`, which drops privileges to the `mongodb` user (uid/gid 999) via `gosu` before starting `mongod`.

## Relationships

No graph-neighbor files are recorded.

## Notes

- The script must run as **root** (the container's default user) because it `chown`s to uid 999; the real `mongodb` user is only active after `docker-entrypoint.sh` calls `gosu`.
- All generation blocks are guarded by `[ ! -s … ]` (file must be non-empty), making them first-boot-only. The CA-cert copy to `/ca-dir` is deliberately **not** guarded — it re-copies every boot to survive a `/ca-dir` volume being recreated independently.
- No passphrase is used on any private key (`-nodes`); there is no human present at container boot to supply one.
- A deployment with a real CA can pre-place `SERVER_PEM` (cert + key concatenated) and `CA_CERT` in the `/keyfile-dir` volume before first boot; the script will skip generation.
- The SAN is hardcoded to `DNS:database` (the compose service name) plus loopback addresses for in-container `mongosh`/`mongodump` calls. If the service name changes, this script must be updated.
