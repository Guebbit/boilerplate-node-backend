---
type: concept
audience: [developer, architect]
---

# Tools explained: core and data

The core stack and the data layer, tool by tool.

## Core stack

### Node.js + TypeScript

**What it is.** Node.js is a JavaScript runtime built on Chrome's V8 engine that lets you run JavaScript outside the browser. TypeScript adds a static type system on top of JavaScript — errors are caught at compile time, not at runtime.

**Problem it solves.** JavaScript alone is untyped and error-prone at scale. Node.js gives you non-blocking I/O suitable for high-concurrency API servers. TypeScript gives you IDE autocomplete, type-safe refactors, and confidence that `data.user.id` actually exists before you ship.

**In this repo.** The source language for everything in `src/`. `tsx` runs TypeScript directly in dev without a build step. CI runs `tsc --noEmit` to catch type errors before tests.

---

### Express

**What it is.** Express is the most widely used HTTP framework for Node.js. It provides routing, a middleware pipeline, and a thin request/response abstraction on top of Node's built-in `http` module.

**Problem it solves.** Raw Node.js `http` is verbose. Express gives you a clean way to declare routes, chain middleware (auth, logging, validation), and send responses — without locking you into an opinionated full-stack framework.

**In this repo.** Express 5 is the transport layer. Routes match URLs, middlewares handle auth and rate limiting, and controllers convert HTTP input into service calls. Everything lives in `src/app.ts` (which assembles the pipeline from `src/app/*`), then a module's own `routes.ts` → `src/kernel/middlewares/` → the module's `controllers/`. Every domain is a module and mounts itself from its manifest; the only router `src/app/routes.ts` still names is the system ping.

→ [Runtime](./runtime.md)

---

### Zod

**What it is.** Zod is a TypeScript-first schema validation library. You define a schema once and Zod both validates the data and infers the TypeScript type from it — no duplicate type declarations.

**Problem it solves.** External input (request bodies, env vars, query strings) is untyped at runtime. Casting it to `any` silently skips validation. Zod enforces shape and type coercion at the boundary and narrows the TypeScript type automatically, so downstream code is safe without extra guards.

**In this repo.** Used in services for business-rule validation and in shared helpers. Also used by `orval` to generate typed API clients from `openapi.yaml`.

→ [Runtime](./runtime.md)

---

### Helmet

**What it is.** Helmet is a collection of small Express middleware functions that set HTTP response headers that browsers use to enable security policies (Content-Security-Policy, X-Frame-Options, HSTS, etc.).

**Problem it solves.** By default Express sends almost no security headers. A browser talking to such a server is exposed to XSS, clickjacking, MIME-sniffing, and other well-known classes of attack. Helmet sets safe defaults in one `app.use(helmet())` call.

**In this repo.** Applied early in the middleware chain so every response gets the headers, regardless of route.

→ [Security](./security.md)

---

### JWT (jose) and password hashing (argon2id)

**What it is.** JSON Web Tokens (JWT) are signed, compact tokens that carry claims (user ID, role, expiry) without a server-side session store. argon2id (from `node:crypto`) is a password hashing algorithm designed to be slow and memory-hungry — which makes brute-force attacks expensive.

**Problem it solves.** A signed token lets another service check a login without calling this one, and a short-lived one limits what a leak is worth. It does **not** save a database read here: every request still looks the account and its roles up, so the token's "no lookup" benefit is not one this repo collects. argon2id prevents a leaked password hash from being reversed quickly.

**In this repo.** One of two session modes, picked by `NODE_SESSION_MODE` ([Two ways to stay signed in](sessions.md)). `jwt` (default): a short-lived access token (Bearer header) plus a long-lived refresh token (HttpOnly cookie), the refresh token also stored server-side so it can be revoked. `cookie`: one random session id kept hashed in the database, no JWT at all. argon2id hashes passwords at user creation and verifies them at login.

→ [Security](./security.md)

---

### express-rate-limit

**What it is.** A middleware that counts requests per IP address over a fixed window and returns `429 Too Many Requests` when the limit is exceeded.

**Problem it solves.** Without rate limiting, a single client can flood the API with requests, degrading it for everyone else or escalating a brute-force credential attack.

**In this repo.** A global limiter is mounted in `src/app/security.ts`, with stricter per-route budgets declared by each module (the full table is generated in [Security](./security.md)). Window and max-requests of the global one come from `NODE_RATE_LIMIT_WINDOW_MS` and `NODE_RATE_LIMIT_MAX`.

→ [Security](./security.md)

---

## Data layer

### MongoDB

**What it is.** MongoDB is a document database. Instead of rows and columns, it stores JSON-like documents (BSON) grouped into collections. Documents in the same collection do not need to share a schema.

**Problem it solves.** Relational databases require you to define a rigid schema upfront and perform joins to reassemble related data. Document databases let you store a product with all its variants, prices, and images in one document — reads are fast because nothing needs joining, and the schema can evolve document by document.

**In this repo.** The primary datastore. All data (users, products, orders, carts) lives in MongoDB. Accessed only through Mongoose models and repositories, never directly from controllers.

→ [MongoDB & Mongoose](./mongodb-mongoose.md)

---

### Mongoose

**What it is.** Mongoose is an ODM (Object-Document Mapper) for MongoDB. It lets you define schemas and models in TypeScript, add lifecycle hooks (`pre('save')`), define instance methods, and write queries with a fluent API instead of raw MongoDB driver calls.

**Problem it solves.** The raw MongoDB driver accepts anything — no schema enforcement, no typed results. Mongoose adds schema validation, relationships via `ref`, query helpers, and TypeScript types so the persistence layer is typed and predictable.

**In this repo.** Every collection has a Mongoose model at `src/modules/<name>/model.ts`, and the matching `repository.ts` beside it uses that model exclusively. Controllers never call Mongoose directly. The shared substrate every model builds on lives in `src/infrastructure/persistence/`.

→ [MongoDB & Mongoose](./mongodb-mongoose.md)

---

### Redis

**What it is.** Redis is an in-memory key-value store. Because data lives in RAM, reads and writes are orders of magnitude faster than a disk-backed database.

**Problem it solves.** Serving the same expensive GET response (complex aggregation, multiple DB joins) repeatedly is wasteful. Without a cache, every request pays the full database cost. Redis stores computed responses with a TTL so repeated reads are served instantly without touching MongoDB.

**In this repo.** Optional server-side response cache for public GET endpoints (products, locales). A route whose answer depends on who is asking is never cached server-side; entries are tagged by domain and a write invalidates its tags. All worker processes share one keyspace, so no broadcast is needed. A second, non-evicting Redis holds the rate-limit counters. When Redis is unavailable the API continues without caching.

→ [Redis Cache](./redis-cache.md)

---

### RabbitMQ

**What it is.** RabbitMQ is a message broker. Producers publish messages to named queues; consumers receive and process them independently. Messages are persisted to disk, so they survive restarts, and failed messages can be requeued for retry.

**Problem it solves.** Some operations (sending email, generating a PDF) are slow or unreliable. Running them inside the HTTP handler means the client waits for them to finish — and if they fail, the request fails too. A message queue decouples the trigger from the work: the handler publishes a job and responds immediately; a separate consumer does the heavy work at its own pace and retries on failure.

**In this repo.** Used for email delivery (`worker.email.send`), image digests, webhook delivery and account exports. Services publish through `enqueueEmail()` / `publishToQueue()`; consumers are registered at boot by `src/app/workers.ts` and by each module. Invoice PDFs are rendered synchronously, not queued. When RabbitMQ is not configured the queue calls fall back inline or no-op.

→ [RabbitMQ](./rabbitmq.md)

---

### restic (backups)

**What it is.** restic is a backup program: one static binary that writes encrypted, deduplicated snapshots to a repository (a local disk, SFTP, S3-compatible storage, or a REST server).

**Problem it solves.** A database dump taken every hour is mostly the same bytes as the last one. A tool that stores each dump whole fills a disk in a week; a tool that stores them unencrypted turns a stolen bucket into a breach. restic cuts the stream into chunks, stores each chunk once, and encrypts on the client, so the storage only ever sees ciphertext and hourly backups cost what changed.

**In this repo.** The `backup` container (`backup` compose profile) streams `mongodump --oplog` into restic with no gzip, backs up the uploads and the mail spool, and applies the keep knobs. The restore drill reads the same repository back. Pinned at 0.19.1; BSD-2-Clause.

→ [Backups](../operate/backups.md) · [restic](../operate/restic.md) · [MongoDB Database Tools](../operate/mongodb-database-tools.md)

---

### rclone (the append-only second machine)

**What it is.** rclone is a command-line tool for storage; its `serve restic` command speaks restic's REST protocol over a folder.

**Problem it solves.** Whoever owns the app server also finds the restic password on it, and could delete every backup before encrypting the database. A repository on another machine that accepts new backups and refuses deletes (`--append-only`) makes the password alone useless for that.

**In this repo.** `docker-compose.backup-server.yml`, dormant until started on a second machine: `rclone serve restic --append-only --private-repos` over TLS, one login per client, plus a weekly `forget --prune` and `check` on the machine's own disk. Pinned at 1.75.2; MIT.

→ [Backup server](../operate/backup-server.md) · [rclone](../operate/rclone.md)

---

## Read next

- [tools-explained](./tools-explained.md): the hub this page belongs to.
