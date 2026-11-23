---
source: docker/mongo-entrypoint.sh
generated_at: 2026-11-22T01:30:31.047372+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/mongo-entrypoint.sh

## Purpose
A wrapper entrypoint for the MongoDB container. On first boot it creates the replica-set keyFile and the wire-TLS material (a self-signed CA and a server certificate) with the ownership mongod needs. It then hands off to the official image's own entrypoint script. It replaced a separate one-shot init service because podman-compose 1.6/libpod refuses to start services that transitively depend on an already-exited container. With a wrapper, only `database` itself needs this logic.

## Key elements
- **keyFile generation**: if `/keyfile-dir/mongo-keyfile` is missing or empty, it writes `openssl rand -base64 756`, sets mode `400`, and chowns it to `999:999` (the image's `mongodb` user).
- **TLS bootstrap**: runs only while `/keyfile-dir/mongo-server.pem` is absent or empty.
  - Creates a self-signed root CA (`mongo-ca.key` / `mongo-ca.crt`, RSA 4096, 10 years, unencrypted via `-nodes`).
  - Creates a server key and CSR with `CN=database`. The SAN is `DNS:database, DNS:localhost, IP:127.0.0.1`.
  - Signs the CSR with the CA, using `mongo-ca.srl` as the serial file.
  - Concatenates key and cert into `mongo-server.pem`, the single-file format `--tlsCertificateKeyFile` expects.
  - Deletes the temporary files in `/tmp`.
  - Sets `chmod 400` and `chown 999:999` on the PEM and the CA key.
- **Shared CA copy**: on every boot it runs `mkdir -p /ca-dir`, copies the CA cert to `/ca-dir/mongo-ca.crt`, and sets `chmod 444` on both copies.
- **Handoff**: `exec docker-entrypoint.sh "$@"` runs the official image's entrypoint, passing through the container's command arguments.

## Relationships
No graph neighbors. The comments refer to these things outside the dependency graph:
- The compose production configuration's `mongod` command uses `$SERVER_PEM` for `--tlsCertificateKeyFile` and `$CA_CERT` for `--tlsCAFile`. It also passes `--tlsAllowConnectionsWithoutCertificates`.
- The `/keyfile-dir` volume is mounted only by `database`. The `/ca-dir` (`mongo-ca-dir`) volume is shared with `app`, `cron`, `setup` and `mongo-rs-init`, which need only the CA cert to verify the server.
- Clients that verify against the CA: `NODE_DB_URI`'s `tlsCAFile`, the healthcheck, `mongo-rs-init`, and the `mongosh`/`mongodump` commands in the backup documentation.

## Notes
- It must run as root, the container's default user. The `chown` to uid/gid 999 needs that, and the official entrypoint later drops to `mongodb` via `gosu`.
- TLS is verified by the client side only. Mutual TLS is intentionally not used.
- To use a CA-issued certificate, place the combined cert-then-key PEM at `$SERVER_PEM` and the CA cert at `$CA_CERT` before first boot. The TLS block is skipped once `$SERVER_PEM` exists.
- The check is on `$SERVER_PEM` only, so if `mongo-ca.crt` or `mongo-ca.key` is lost while the PEM remains, they are not regenerated.
- The CA cert is re-copied to `/ca-dir` on every boot. This covers a `/ca-dir` volume recreated without `/keyfile-dir`.
- The script uses `set -euo pipefail`.
