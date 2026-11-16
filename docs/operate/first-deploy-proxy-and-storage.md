---
type: task
audience: [operator]
---

# Proxy, uploads and backups on a first deploy

What differs from dev, how to put TLS in front, where uploads live, and the first backup.

## Before you start

- The stack is up and healthy: [Check it worked](./first-deploy.md#check-it-worked).
- A domain pointing at the host.

## What's different from dev

| Dev (`compose.override.yaml`)                               | Production (`compose.production.yaml`)                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Source bind-mounted, `tsx` watches for changes              | Source baked into the image at build time                                                                                                |
| API port published to `${NODE_HOST:-127.0.0.1}`             | API port published to `127.0.0.1` only                                                                                                   |
| Full observability stack included                           | Only with the `monitoring` profile — see [Monitoring and alerts](./first-deploy-monitoring.md#monitoring-and-alerts)                     |
| `NODE_ENABLE_CLUSTERING=1` (optional, `dev:docker:cluster`) | The image runs `src/main.ts`: one process per container, always; scale with orchestrator replicas                                        |
| Runs as whatever user starts compose                        | Runs as the non-root `node` user inside the image, `read_only` root filesystem, all Linux capabilities dropped                           |
| Mongo is a single-member replica set with no auth           | Mongo is a single-node replica set (`rs0`), a scoped `readWrite` app user behind a root account, both Redis instances require a password |
| Uploads/storage/quarantine are host paths or absent         | `uploads`, `storage` and `quarantine` are named volumes — `storage` also holds the outbound mail spool, so back it up                    |

Clustering is off on purpose: scale with an orchestrator's replicas instead, so
one thing decides how many processes are live, not two layers of process management fighting a
rolling deploy.

## Steps

### 1 · Putting a reverse proxy in front {#putting-a-reverse-proxy-in-front}

The app itself never terminates TLS. The API is bound to loopback specifically so that publishing
it on a public interface — plain HTTP, carrying the auth cookies this application sets — is not the
easy path. Put any TLS proxy (nginx, Caddy, a managed load balancer) in front, terminate TLS there,
proxy to `127.0.0.1:${NODE_PORT}`, **and set `NODE_TRUST_PROXY_HOPS=1`** (below).

If your proxy runs in a rootless Podman container, note that rootless Podman cannot publish ports
below 1024 by default, and a proxy publishes 80 and 443. Lower the limit once per host:

```bash
# Let unprivileged users bind 80 and up; the file makes it survive a reboot.
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/90-unprivileged-ports.conf
sudo sysctl --system
```

Set `NODE_TRUST_PROXY_HOPS` to the number of proxies in front (usually `1`; `.env-example` leaves
it commented). It defaults to `0`, which reads the caller's address from the socket — with a proxy in front, that is the proxy's
address for every request, so every caller shares one rate-limit bucket and every audit row names
the proxy. See [trust proxy](../understand/security.md#trust-proxy-and-the-two-ways-to-get-it-wrong).

Two proxy timeouts must agree with the app's, or a slow request or an idle socket turns into a
502 or a cut upload with no problem body:

- The proxy's **read** timeout is at least `NODE_HTTP_REQUEST_TIMEOUT_MS` +
  `NODE_HTTP_HEADERS_TIMEOUT_MS`, so a slow upload ends on the app's side (`applyServerTimeouts` in
  `src/app/security.ts`).
- The proxy's **idle-to-app** timeout is below `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS`: the proxy closes
  idle connections first, so it never reuses a socket Node closed.

### 2 · Uploaded images do not outlive the container {#uploaded-images-do-not-outlive-the-container}

`imageStore` (`src/infrastructure/adapters/image-store.ts`) writes uploads to disk. The compose
file mounts a named volume (`uploads:/app/public/images`) as the stopgap — without it, a redeploy
loses every uploaded image. The volume still pins the deployment to one host, and two replicas do
not share what they store. Where uploads live, and why: [Uploads and the host volume](./deployment-hardening.md#object-storage-for-uploads).

### 3 · Backups {#backups}

Before the first real customer, in this order:

1. **A second machine** (any host that runs Docker or Podman), running `compose.backup-server.yaml`:
   an append-only restic server that refuses deletes. [Backup server](backup-server.md) has the steps.
2. **The knobs** in `clients/acme/.env`: `COMPOSE_PROFILES=bundled,backup`,
   `BACKUP_REPOSITORY=rest:https://<second machine>:8000/acme/`, `BACKUP_PRUNE=false`, and
   `BACKUP_HEARTBEAT_URL` if you run Gatus ([one endpoint per client](gatus.md#backup-freshness)). The secrets are in [Secrets](./first-deploy.md#secrets); keep a copy of
   `restic_password` off the host.
3. **Run the restore drill once**: `docker compose ... --profile restore-drill run --rm restore-drill`.
   It restores the latest snapshot into a throwaway Mongo and says how long that took.
   A backup that has never been restored is a hope.

Details and the knobs: [Backups](backups.md).

## Read next

- [Getting Started — Production](./first-deploy.md)
