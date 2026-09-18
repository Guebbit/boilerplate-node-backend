# Two Client Stacks

The silo decision — one client, one stack, one database — is a claim until it is demonstrated. This
page is the demonstration: two independent stacks built and run side by side on the same machine,
from the compose file exactly as shipped.

```mermaid
flowchart TB
    subgraph Host["one host"]
        subgraph Acme["COMPOSE_PROJECT_NAME=acme"]
            AcmeApp["app :3101"] --> AcmeDB[("database\nreplica set rs0")]
        end
        subgraph Brava["COMPOSE_PROJECT_NAME=brava"]
            BravaApp["app :3102"] --> BravaDB[("database\nreplica set rs0")]
        end
    end

    classDef acme fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef brava fill:#fce7f3,stroke:#db2777,color:#111827;
    class AcmeApp,AcmeDB acme;
    class BravaApp,BravaDB brava;
```

Every container, network and volume is namespaced by `COMPOSE_PROJECT_NAME` — the two stacks share
nothing, not even a Docker network, unless the [Traefik overlay](#many-clients-behind-one-proxy)
below is layered on to share the proxy.

::: warning Read this alongside the compose files
`docker-compose.production.yml` and `docker-compose.proxy.yml` explain each decision inline. This
page is the walkthrough and the two demonstrations; the compose files are the source of truth.
:::

## Bring up the first stack

```bash
mkdir -p clients/acme
cp .env-example clients/acme/.env   # then set real values
export COMPOSE_PROJECT_NAME=acme
docker compose --env-file "clients/acme/.env" -f docker-compose.production.yml up -d --build
```

One `up -d` brings up everything in the right order — `database`'s own entrypoint generates the
replica set's keyFile, `mongo-rs-init` initiates the set, `setup` runs `db:sync` and
`access:bootstrap` once that succeeds, then `app`/`cron` start.

**A fresh stack has an organisation but no admin** — every signup is a `customer`, on purpose (a
race to be first is a known vulnerability pattern). Sign up through the app once, then:

```bash
docker compose --env-file "clients/acme/.env" -f docker-compose.production.yml \
    exec app npm run access:grant -- you@example.com admin
```

Verified end to end on this exact sequence: signup, the verification email arriving (a local
Mailpit stood in for real SMTP), `access:grant`, login, and a real checkout — all against a stack
that started from nothing.

## Why the database is a replica set of one

**Corrected from an earlier draft**, which claimed a replica set gives "PITR and transactions" —
checked, and neither is quite right:

- **This app uses no transactions** — confirmed, no `startSession`/`withTransaction` anywhere in
  `src/`.
- **`mongodump --oplog` is not point-in-time recovery.** It gives one dump that is consistent
  ACROSS collections while writes keep arriving — real PITR needs continuous oplog capture
  ([Percona Backup for MongoDB](https://docs.percona.com/percona-backup-mongodb/index.html)).

What a replica set of one genuinely buys: MongoDB's own documented production topology, the only
thing `--oplog` or PBM ever build on top of, and a `mongodump` that cannot capture an order without
its payment mid-checkout. Converting a live standalone to a set later is a data-bearing migration;
starting as a set of one is a handful of compose lines.

**The mechanics, verified against this exact compose file:**

- `database` boots `mongod --replSet rs0 --keyFile ...` under a small entrypoint wrapper
  (`docker/mongo-entrypoint.sh`) that generates the keyFile into a named volume on first boot, with
  the ownership mongod actually needs (the image's `mongodb` user, uid 999) — a host-generated,
  bind-mounted keyFile keeps the host's own uid and mongod refuses to read it.
- The existing `docker/mongo-init.js` needed **no change** for this: the official image always
  boots a temporary, flag-stripped standalone to run `docker-entrypoint-initdb.d/*` and create the
  app user, sharing the same data directory the real, replSet-enabled mongod uses afterward.
- The one genuinely new piece is `rs.initiate()` — `docker/mongo-rs-init.sh`, a one-shot service
  that waits for the real mongod, initiates the set, and waits for PRIMARY before exiting.
  `setup` waits on it finishing before `db:sync`/`access:bootstrap` run.

**A dependency-chain lesson, found while building this:** an earlier version generated the keyFile
in its own one-shot service, a sibling `database` depended on. That broke every service depending
on `database` in turn — podman-compose 1.6/libpod refuses to start anything that transitively
requires an already-exited container. Folding the keyFile generation into `database`'s own
entrypoint instead of a separate service removed the dependency chain entirely, and is simpler
besides. Docker Compose itself (what a real host runs) does not have this restriction — it was
found and fixed here because this experiment ran on podman.

## The two demonstrations

**1. An order in `acme` is invisible to `brava`.** With `acme` running and an order placed:

```bash
export COMPOSE_PROJECT_NAME=brava
docker compose --env-file "clients/brava/.env" -f docker-compose.production.yml up -d
curl http://127.0.0.1:3102/products   # {"data":{"items":[],...}} — brava has never heard of acme
```

Verified directly against both databases, not just the API: `acme`'s `users`/`orders` collections
hold the signed-up admin and their order; `brava`'s hold nothing. Two stacks, two databases, zero
shared state.

**2. Deleting `brava` never touches `acme`.**

```bash
docker compose -p brava -f docker-compose.production.yml down -v
curl http://127.0.0.1:3101/products   # acme's product and order are still there
```

Every one of `brava`'s containers and named volumes is gone; `acme` never noticed. This is also the
GDPR-erasure story for a client relationship ending, demonstrated rather than asserted — silo means
"delete a client's data" is one `down -v`, not a query someone has to get right.

## Many clients behind one proxy

The base compose file stays proxy-agnostic — publish `127.0.0.1:${NODE_PORT}` and put any
TLS-terminating proxy in front, same as a single-stack deployment. `docker-compose.proxy.yml` is
the recipe for the case that specifically needs SHARED infrastructure: several client stacks on one
box, fronted by one proxy that discovers each stack automatically.

**Traefik v3**, not Caddy: adding client #11 is "start its stack" — Traefik's Docker provider reads
the new router straight off the container's own labels, nothing central to edit or restart. It is
also k3s's own default ingress controller, so if a fleet of Compose stacks ever outgrows Compose,
the proxy is one part of the stack that carries over unchanged.

```bash
docker network create proxy   # once, per host
export COMPOSE_PROJECT_NAME=acme
docker compose --env-file "clients/acme/.env" \
    -f docker-compose.production.yml -f docker-compose.proxy.yml up -d
```

**Verified structurally, not against a real certificate:** Traefik's Docker-provider discovery was
confirmed live — with `app`'s labels in place, Traefik's own log shows the router it built,
`acme@docker`, with the exact `Host(...)` rule the labels declare. Real ACME issuance needs a
public DNS record and ports 80/443 reachable from Let's Encrypt, neither of which a sandboxed build
environment can offer; on a real host with a real domain this is the same mechanism, just reachable
from the internet.

Two podman-compose 1.6 quirks worth knowing if you run this on podman rather than Docker (a real
Docker host hits neither):

- `ports: !reset []` (drops the loopback publish, since Traefik takes over routing) parses and
  works correctly.
- Referencing the base file's implicit default network by name (`networks: [default, proxy]`)
  needs that network declared explicitly at the top level of the overlay
  (`networks: { default: {} }`) — podman-compose otherwise reports `missing networks: default`.
  Both forms are legal Compose Specification; the second is only needed to work around this one
  tool.

## When Compose stops being the answer

**Not yet.** At twenty clients on one box, Kubernetes adds a control plane, an ingress controller,
cert-manager, a secrets pipeline and a CNI — five more things to patch — to solve a problem Compose
already solves. Two or three hosts running Compose behind one proxy each is a solved problem.

Any **one** of these flips the answer:

```mermaid
flowchart TD
    T1["A VPS reboot taking every<br/>client down is unacceptable"] --> K
    T2["You deploy often enough that health-gated<br/>rollouts and one-command rollback pay"] --> K
    T3["A contract demands isolation and resource<br/>guarantees Compose cannot demonstrate"] --> K
    T4["A second engineer joins — declarative<br/>state instead of tribal knowledge"] --> K
    K{"A trigger fired"} --> S["Pick the SHAPE: self-run k3s<br/>on your own VMs, or a managed<br/>control plane"]
    S --> M["Move Mongo to a managed service FIRST"]
```

**k3s is not the hobbyist option.** It is a CNCF-certified conformant Kubernetes distribution,
passing the same conformance suite as any other, shipped by SUSE as its supported edge product and
run by telcos at fleet scale. Its CNCF status is Sandbox, accepted 19 Aug 2020 and never promoted —
read that as governance inertia (it has a corporate owner and does not need CNCF's ladder), not
immaturity. For context, the CNCF 2025 survey puts Kubernetes production use at 82%, with 79% of
users on a managed service; managed share is roughly EKS 42% / GKE 27% / AKS 23%.

The choice is the **shape**, not the vendor — which vendors offer which shape, in which regions,
under which jurisdiction, is [Hosting](./hosting.md)'s capability matrix:

| Shape                        | What you run                              | What you get                               |
| ---------------------------- | ----------------------------------------- | ------------------------------------------ |
| Self-run k3s on your own VMs | The control plane, upgrades, etcd backups | The cheapest option, any provider with VMs |
| A managed control plane      | Only the workloads                        | Upgrades and control-plane HA done for you |

### Every concept here already has a Compose-shaped ancestor

This is why silo maps onto Kubernetes cleanly: the model does not change, only the machinery.

| Compose today                          | Kubernetes later                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `docker compose -p acme`               | a **namespace** per client                                                                    |
| `clients/acme/.env`                    | a **Helm** values file per client                                                             |
| "don't let a client hog the box"       | **ResourceQuota** + **LimitRange** per namespace                                              |
| separate stacks can't reach each other | **NetworkPolicy**                                                                             |
| secrets in an untracked `.env`         | **Sealed Secrets** or **External Secrets Operator** — per-client secrets that can live in git |
| Traefik's ACME resolver                | **cert-manager**                                                                              |
| the app's `GET /` healthcheck          | a **liveness probe** — already there                                                          |
| the one-shot `setup` service           | a **Job**, or a pre-upgrade Helm hook                                                         |
| the `mongo-data` volume                | **StatefulSet** + **PersistentVolumeClaim**                                                   |

**The last row is the one that genuinely hurts**, and it is the strongest argument for moving Mongo
to a managed service _before_ moving to Kubernetes, not after. Running stateless app containers on
k8s is ordinary; running stateful databases on it is a discipline of its own.

Sources:
[CNCF 2025 Annual Survey](https://www.cncf.io/announcements/2026/01/20/kubernetes-established-as-the-de-facto-operating-system-for-ai-as-production-use-hits-82-in-2025-cncf-annual-cloud-native-survey/) ·
[CNCF k3s project page](https://www.cncf.io/projects/k3s/) ·
[Rancher k3s](https://www.rancher.com/products/k3s) ·
[k3s networking — Traefik by default](https://docs.k3s.io/networking/networking-services)

## Where to go next

| You want to                                    | Read                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| Understand the tenancy model this demonstrates | [Tenancy](../theory/tenancy.md)                                  |
| Back up what a stack holds                     | [Backups](./backups.md)                                          |
| Pick a host that can run this                  | [Hosting](./hosting.md)                                          |
| See every container in the base compose file   | [Docker & Podman](./docker-and-podman.md)                        |
| Run a single stack, start to finish            | [Getting Started — Production](../getting-started-production.md) |
