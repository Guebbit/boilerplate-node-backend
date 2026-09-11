# Hosting

This boilerplate is **provider-neutral, deliberately.** It names what a host must offer and which
categories of provider offer it; it never picks one. Different deployments use different
providers, and this page stays a map rather than a recommendation.

::: warning Facts, not verdicts
Every fact below carries a **Verified** date — the day it was last checked against the vendor's own
pages. No automated check keeps these current; a stale row misleads rather than breaks, so
re-verify before you rely on one. The only verdict this page makes is "does the stack run here, and
how" — never "should you use this vendor."
:::

## 1 · What this app needs from a host

Read off the code, not assumed:

```mermaid
flowchart TD
    Start(["Can my host run this?"]) --> Q1{"Long-running process,\nor any OCI container?"}
    Q1 -->|No| Serverless["No — serverless functions\ncan't hold a queue consumer\nor a persistent disk"]
    Q1 -->|Yes| Q2{"MongoDB 8,\nbundled or managed?"}
    Q2 -->|Neither| NoDB["No"]
    Q2 -->|Yes| Q3{"Persistent disk,\nor an S3-compatible store?"}
    Q3 -->|Neither| Uploads["With changes —\nuploads have nowhere to live"]
    Q3 -->|Yes| Q4{"TLS in front,\noutbound SMTP on 587?"}
    Q4 -->|Neither| NoTLS["With changes"]
    Q4 -->|Yes| Yes(["Runs as shipped"])

    classDef bad fill:#fee2e2,stroke:#dc2626,color:#111827;
    classDef warn fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef good fill:#dcfce7,stroke:#16a34a,color:#111827;
    class Serverless,NoDB bad;
    class Uploads,NoTLS warn;
    class Yes good;
```

| Need                                                         | Required?                               | Why                                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A long-running Node 25+ process, or an OCI container runtime | **Yes**                                 | The API, its queue consumers and its graceful shutdown all assume a process that stays up                                                   |
| MongoDB 8 — bundled or managed                               | **Yes**                                 | The only store of record; a single-node replica set is what the shipped compose file runs (see [Two Client Stacks](./two-client-stacks.md)) |
| A persistent disk for uploads                                | **Yes**, until an S3 image store exists | Uploaded images live on disk today; an ephemeral filesystem loses them on every deploy                                                      |
| TLS termination in front                                     | **Yes**                                 | The API listens on plain HTTP; its auth cookies need HTTPS                                                                                  |
| Outbound email (SMTP)                                        | **Yes**                                 | Signup verification, password reset. Some clouds block port 25 — 587 is what matters                                                        |
| A scheduler for the `ops/` jobs                              | **Yes**                                 | Reapers and sweeps. The compose file ships a `cron` container; a platform's own scheduler works too                                         |
| Redis                                                        | Optional                                | Response cache and shared rate-limit buckets — see [Redis Cache](./redis-cache.md). Without it, each process counts on its own              |
| RabbitMQ                                                     | Optional                                | Without it, email sends inline and webhook deliveries wait for the sweep — see [RabbitMQ](./rabbitmq.md)                                    |
| Chromium                                                     | Optional                                | Only the PDF invoice endpoint. About +200 MB of image                                                                                       |
| Memory                                                       | ~1–1.5 GB per full stack                | Node 250–400 MB, MongoDB's cache, the OS. 4 GB comfortably runs two stacks, 8 GB runs 8–10 small ones                                       |

**Serverless functions cannot run this app** — no long-lived process, no queue consumer, no local
disk to hold an upload between requests.

## 2 · Hosting categories, drawn

```mermaid
flowchart LR
    subgraph Categories
        Shared["Shared / cPanel"]
        VPS["VPS / cloud VM"]
        Dedicated["Dedicated server"]
        PaaS["Container PaaS"]
        Serverless["Serverless"]
        K8s["Managed Kubernetes"]
    end

    Shared -.->|"usually no"| Runs(["Runs this app"])
    VPS -->|"as shipped"| Runs
    Dedicated -->|"as shipped"| Runs
    PaaS -->|"image + managed services"| Runs
    Serverless -.->|"never"| Runs
    K8s -->|"see the trigger list"| Runs

    classDef no fill:#fee2e2,stroke:#dc2626,color:#111827;
    classDef yes fill:#dcfce7,stroke:#16a34a,color:#111827;
    class Shared,Serverless no;
    class VPS,Dedicated,PaaS,K8s yes;
```

## 3 · The capability matrix

Columns, once per category:

| Column                      | Meaning                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Node / Containers / Compose | Can it run a Node process? Any OCI image? A compose file as-is?                             |
| Root / SSH                  | Can you get a shell and install things                                                      |
| Managed MongoDB / Redis     | Offered by the same provider                                                                |
| Persistent disk             | Survives a redeploy                                                                         |
| Scheduled jobs              | A built-in cron, or only through your own container                                         |
| Email                       | Mailboxes / SMTP it provides — a shared host that can't run the app can still send its mail |
| EU region · HQ jurisdiction | Where data can live, and whose law governs the company                                      |
| Cheapest plan that runs it  | Plan **name**, linked to the pricing page — no prices restated here                         |
| Runs this stack             | **As shipped** (compose) · **With changes** (say which) · **No** (say why)                  |
| Verified                    | The date this row's facts were last checked against the vendor's own pages                  |

**Shared hosting (cPanel and similar)** — the example that motivated the "with changes" column.
[HostGator's own support pages](https://www.hostgator.com/help/article/hostgator-data-centers),
checked 2026-09-10:

| Tier                                | Node | Containers | MongoDB | Root | EU region | Verified   |
| ----------------------------------- | ---- | ---------- | ------- | ---- | --------- | ---------- |
| Shared / Cloud / WordPress (cPanel) | No   | No         | No      | No   | No        | 2026-09-10 |
| VPS (KVM, AlmaLinux 9)              | Yes  | Yes        | Yes     | Yes  | No        | 2026-09-10 |
| Dedicated                           | Yes  | Yes        | Yes     | Yes  | No        | 2026-09-10 |

HostGator's own marketing page and its knowledge-base price chart disagreed by roughly 6× on
identical VPS plans at the time of checking — a reminder to click through to the vendor's own
current page rather than trust a cached number, here or anywhere else. `.env-example` names
HostGator as an SMTP host precisely because "can't run the app, can still send its mail" is a real,
useful answer for a shared host.

**Developer VPS / cloud VM and the hyperscalers** — adoption context rather than a full matrix
(each entry needs its own verification pass before publishing a row): AWS held 43.3% and
DigitalOcean 10.7% of the developer-VPS category in the
[2025 Stack Overflow survey](https://survey.stackoverflow.co/2025/technology). Hetzner is absent
from that survey but runs 500,000+ servers and passed one million concurrent cloud instances in 2025. European providers collectively hold about
[15% of the European cloud market](https://www.srgresearch.com/articles/european-cloud-providers-local-market-share-now-holds-steady-at-15).
Any VPS that meets §1's requirements — a shell, an OCI runtime, a persistent disk — runs the
compose file exactly as shipped.

**Container PaaS** (Render, Railway, Fly.io, Heroku, DigitalOcean App Platform, Koyeb) runs the
built image directly; the compose file itself doesn't apply, but the same requirements do — a
platform without a persistent disk needs the (not-yet-built) S3 image store, and its own managed
MongoDB/Redis/RabbitMQ addons stand in for the bundled ones.

**Managed Kubernetes** — only relevant once
[a trigger fires](../theory/tenancy.md#9-when-to-revisit-this-decision); nothing here is provider
work until then. Entry prices for 3 workers + a load balancer, checked 2026-09-10: self-run k3s on
Hetzner ~€24/mo · OVHcloud MKS ~$49.50 · Scaleway Kapsule ~€48 · DOKS ~$48 · Civo ~$43. Hetzner
offers no first-party managed control plane. Managed market share splits roughly EKS 42% / GKE 27%
/ AKS 23%, ~8% to everyone else.

## 4 · How to deploy, per category

| Category           | What actually runs                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VPS / dedicated    | The compose file as shipped — see [Getting Started — Production](../getting-started-production.md)                                                     |
| Container PaaS     | The image `docker build -f docker/Dockerfile.production` produces, plus the platform's own managed MongoDB/Redis/RabbitMQ in place of the bundled ones |
| Managed Kubernetes | Not yet — see the trigger list linked above                                                                                                            |

## 5 · Managed backing services — "compatible, not identical"

A managed MongoDB, Redis or RabbitMQ is not a drop-in guarantee of identical behaviour, only of the
same wire protocol:

- **MongoDB Atlas** is 75% of MongoDB Inc.'s own Q3 FY2026 revenue and the dominant managed
  offering; its free M0 tier includes EU regions (Milan among them) but is capped at 512 MB,
  pauses after 30 idle days, and ships no backups — fine for evaluating this boilerplate, not for a
  client relying on it.
- **Azure Cosmos DB for MongoDB** and **AWS DocumentDB** both speak the MongoDB wire protocol
  without being MongoDB — features this app might one day use (a specific aggregation operator, a
  specific index type) are the risk, not a certainty; check the specific feature against the
  vendor's own compatibility page before relying on it.
- Switching from bundled to managed is already a config change, not a code one —
  `COMPOSE_PROFILES` and three `NODE_*_URL` variables are the whole switch. See
  [Two Client Stacks](./two-client-stacks.md).

## 6 · The data-protection lens

Facts to weigh, not a verdict this page makes for you:

- The **US CLOUD Act** lets US authorities compel a US-headquartered provider to produce data
  wherever it is stored — a tension with GDPR Article 48 that remains unresolved as of this
  writing.
- **EU-headquartered options exist at every tier**: Hetzner (German GmbH), OVHcloud and Scaleway
  (French), Aruba (Italian). OVHcloud additionally holds the French SecNumCloud qualification.
- **MongoDB Atlas itself runs on AWS, Google Cloud or Azure** — choosing Atlas over a self-hosted
  Mongo does not remove a US company from the processing chain, it adds a second one.
- None of this is a recommendation for or against any provider — it is what a client's own DPA and
  risk tolerance should be weighed against.

## 7 · Keeping it true

- Re-verify a row by visiting the vendor's own pricing/docs page named in its **Verified** date —
  never trust a cached number, including the ones on this page.
- The provider list itself is chosen by rule, not by taste: the hyperscalers named in the latest
  Stack Overflow Developer Survey, the largest European VPS providers, the container PaaS options
  actually used for Node, and the managed Kubernetes offerings by market share plus EU-owned
  alternatives. Add a row when a rule-based candidate is missing; drop one only when it stops
  meeting the rule.

## Where to go next

| You want to                                | Read                                                             |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Run a single stack, start to finish        | [Getting Started — Production](../getting-started-production.md) |
| Run two, on one host                       | [Two Client Stacks](./two-client-stacks.md)                      |
| Understand why one stack serves one client | [Tenancy](../theory/tenancy.md)                                  |
| Back up what a stack holds                 | [Backups](./backups.md)                                          |
