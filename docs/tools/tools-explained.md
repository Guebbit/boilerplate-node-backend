# Tools Explained

This page answers three questions for every tool in the stack: **what it is**, **what problem it solves**, and **what it does in this repo**.
Each section links to the dedicated page for configuration details and code pointers.

---

## Core stack

### Node.js + TypeScript

**What it is.** Node.js is a JavaScript runtime built on Chrome's V8 engine that lets you run JavaScript outside the browser. TypeScript adds a static type system on top of JavaScript — errors are caught at compile time, not at runtime.

**Problem it solves.** JavaScript alone is untyped and error-prone at scale. Node.js gives you non-blocking I/O suitable for high-concurrency API servers. TypeScript gives you IDE autocomplete, type-safe refactors, and confidence that `data.user.id` actually exists before you ship.

**In this repo.** The source language for everything in `src/`. `tsx` runs TypeScript directly in dev without a build step. CI runs `tsc --noEmit` to catch type errors before tests.

---

### Express

**What it is.** Express is the most widely used HTTP framework for Node.js. It provides routing, a middleware pipeline, and a thin request/response abstraction on top of Node's built-in `http` module.

**Problem it solves.** Raw Node.js `http` is verbose. Express gives you a clean way to declare routes, chain middleware (auth, logging, validation), and send responses — without locking you into an opinionated full-stack framework.

**In this repo.** Express 5 is the transport layer. Routes match URLs, middlewares handle auth and rate limiting, and controllers convert HTTP input into service calls. Everything lives in `src/app.ts` → `src/routes/` → `src/middlewares/` → `src/controllers/`.

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

### JWT (jsonwebtoken + bcrypt)

**What it is.** JSON Web Tokens (JWT) are signed, compact tokens that carry claims (user ID, role, expiry) without a server-side session store. `bcrypt` is a password hashing algorithm designed to be slow — which makes brute-force attacks expensive.

**Problem it solves.** Sessions stored in a database require a lookup on every request and create shared state that complicates horizontal scaling. JWTs are stateless: the server verifies the signature without a database round-trip. `bcrypt` prevents a leaked password hash from being reversed quickly.

**In this repo.** Short-lived access token (Bearer header) + long-lived refresh token (HttpOnly cookie). Refresh tokens are also stored server-side so they can be revoked. `bcrypt` hashes passwords at user creation and verifies them at login.

→ [Security](./security.md)

---

### express-rate-limit

**What it is.** A middleware that counts requests per IP address over a sliding window and returns `429 Too Many Requests` when the limit is exceeded.

**Problem it solves.** Without rate limiting, a single client can flood the API with requests, degrading it for everyone else or escalating a brute-force credential attack.

**In this repo.** Applied globally in `src/app.ts`. Window and max-requests are configurable via `NODE_RATE_LIMIT_WINDOW_MS` and `NODE_RATE_LIMIT_MAX`.

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

**In this repo.** Every collection has a Mongoose model in `src/models/`. Repositories in `src/repositories/` use those models exclusively. Controllers never call Mongoose directly.

→ [MongoDB & Mongoose](./mongodb-mongoose.md)

---

### Redis

**What it is.** Redis is an in-memory key-value store. Because data lives in RAM, reads and writes are orders of magnitude faster than a disk-backed database.

**Problem it solves.** Serving the same expensive GET response (complex aggregation, multiple DB joins) repeatedly is wasteful. Without a cache, every request pays the full database cost. Redis stores computed responses with a TTL so repeated reads are served instantly without touching MongoDB.

**In this repo.** Optional server-side response cache for GET endpoints. Each cached entry is scoped to the authenticated user (no cross-user leakage) and tagged by domain (`products`, `orders`, `users`). Writes invalidate related tags. Redis pub/sub synchronises eviction across all worker processes. When Redis is unavailable the API continues without caching.

→ [Redis Cache](./redis-cache.md)

---

### RabbitMQ

**What it is.** RabbitMQ is a message broker. Producers publish messages to named queues; consumers receive and process them independently. Messages are persisted to disk, so they survive restarts, and failed messages can be requeued for retry.

**Problem it solves.** Some operations (sending email, generating a PDF) are slow or unreliable. Running them inside the HTTP handler means the client waits for them to finish — and if they fail, the request fails too. A message queue decouples the trigger from the work: the handler publishes a job and responds immediately; a separate consumer does the heavy work at its own pace and retries on failure.

**In this repo.** Used for email delivery and async PDF generation. Controllers publish to the `emails` or `pdf` queue via `publishToQueue()`. Workers in `src/workers/` consume those queues. When RabbitMQ is not configured all queue calls silently no-op.

→ [RabbitMQ](./rabbitmq.md)

---

## Outbound

### Nodemailer + EJS (email)

**What it is.** Nodemailer is the standard SMTP client for Node.js. EJS (Embedded JavaScript) is a template engine that renders HTML strings from data.

**Problem it solves.** Sending a formatted HTML email requires connecting to an SMTP relay, rendering a template, handling attachments, and dealing with SMTP errors. Nodemailer abstracts the transport; EJS handles the HTML so email markup stays in `views/` files, not in code strings.

**In this repo.** Used for password-reset emails, order confirmations, and contact-form notifications. Templates live in `views/*.ejs`. Calls go through `enqueueEmail()` which either publishes to RabbitMQ (if configured) or calls Nodemailer directly.

→ [Email & PDF Rendering](./email-and-rendering.md)

---

### Puppeteer / puppeteer-core (PDF)

**What it is.** Puppeteer is a Node.js library that controls a Chromium browser programmatically. `puppeteer-core` is the same thing without a bundled Chromium binary — you must provide the browser yourself.

**Problem it solves.** Generating pixel-perfect, styled PDFs from HTML is hard with pure-JS libraries. Driving a real browser to render the HTML and export it as PDF produces output that matches what users would see in a browser tab — fonts, CSS grid, images and all.

**In this repo.** Used for order invoice generation (`GET /orders/:id/invoice`). The Dockerfile pre-installs Chromium so the container has a browser available. Without `PUPPETEER_EXECUTABLE_PATH` pointing at a browser binary the invoice endpoint will error at request time; the rest of the API keeps running.

→ [Email & PDF Rendering](./email-and-rendering.md)

---

### WebSockets (ws)

**What it is.** WebSockets provide a persistent, full-duplex connection between client and server over a single TCP socket. Unlike HTTP, either side can send a message at any time without the other side first making a request.

**Problem it solves.** HTTP is request-response: the client asks, the server answers. For live features (chat, live dashboards, collaborative editing) the server needs to push data to the client without waiting for a poll. Polling is wasteful and has latency proportional to the poll interval; WebSockets eliminate both problems.

**In this repo.** A small chat example at `/ws/chat` shows how to attach a WebSocket server to the same Node process as the REST API. The implementation is intentionally thin scaffolding, not a production messaging stack. Event contracts are defined in `asyncapi.yaml`.

→ [WebSockets](./websockets.md)

---

### PostHog (product analytics)

**What it is.** PostHog is an open-source product analytics platform. It captures user and business events (signups, page views, purchases) and lets you analyse funnels, retention, and feature adoption through a web UI. It can be self-hosted or used as a cloud service.

**Problem it solves.** Infrastructure metrics (Prometheus) tell you the API is healthy but not whether users are actually completing signups or dropping off at checkout. Product analytics answer the "are users doing what we expect?" question from a product/business perspective rather than an infrastructure one.

**In this repo.** Example events (login, product view, checkout) are emitted from controllers via a thin wrapper. PostHog is fully optional — when `NODE_POSTHOG_API_KEY` is not set, all analytics calls are no-ops.

→ [PostHog](./posthog.md)

---

## Observability stack

Observability is the ability to understand what a running system is doing from its outputs. Three complementary signals cover the full picture:

| Signal      | Question it answers                                         | Tool in this repo                            |
| ----------- | ----------------------------------------------------------- | -------------------------------------------- |
| **Traces**  | What did one specific request actually do, step by step?    | OpenTelemetry → OTel Collector → Tempo       |
| **Metrics** | How is the system behaving in aggregate over time?          | Prometheus → Grafana                         |
| **Logs**    | What text events happened, in what order, on which request? | Winston → stdout → Promtail → Loki → Grafana |

---

### Winston (logs)

**What it is.** Winston is the most widely used structured logging library for Node.js. It supports multiple transports (stdout, files, HTTP) and formats (JSON, pretty-print) and lets you define custom log levels.

**Problem it solves.** `console.log` strings are hard to parse, filter, or correlate across requests. Structured JSON logs (one object per line) can be ingested by a log aggregator (Loki, Elasticsearch, CloudWatch) and queried with filters like `level=error AND service=api`.

**In this repo.** Two loggers: `logger` for request/access logs and `auditLogger` for security events. Both write JSON to stdout. Every log line carries `trace_id` so a log entry can be linked back to its full trace in Grafana. Sensitive fields (`password`, `token`, `authorization`) are redacted before any log is written.

→ [Winston & Audit Logs](./winston.md)

---

### Prometheus (metrics)

**What it is.** Prometheus is a time-series database and monitoring system. It works by scraping an HTTP endpoint exposed by the application — at regular intervals Prometheus pulls the current metric values and stores them as time-stamped data points.

**Problem it solves.** Logs and traces tell you about individual events. Metrics answer aggregate questions: "What is the current request rate?", "How many errors happened in the last 5 minutes?", "Is p95 latency creeping up?" Without metrics you are blind to trends until they become outages.

**In this repo.** Scrapes `/observability/metrics` every 15 seconds. Metrics include HTTP request rates, latency histograms (p50/p95/p99), error counts, in-flight requests, and business counters (logins, checkouts). Alert rules fire to Alertmanager when error rate or latency crosses configured thresholds. Stored for 7 days.

→ [Prometheus](./prometheus.md)

---

### Alertmanager

**What it is.** Alertmanager is Prometheus's companion for alert routing. Prometheus evaluates rules and marks alerts as firing; Alertmanager groups, deduplicates, silences, and routes those alerts to configured receivers (Slack, PagerDuty, email, webhooks).

**Problem it solves.** If Prometheus fired an alert directly to every receiver every 15 seconds during an outage you would be spammed with hundreds of identical messages. Alertmanager batches related alerts, applies repeat intervals, and applies silence rules — so on-call teams get one actionable notification, not a flood.

**In this repo.** Local dev uses a `null` receiver so no real notifications are sent. Alert rules (`prometheus.alert-rules.yaml`) cover API down, high error rate, high latency, high in-flight count, and heap exhaustion. Replace the receiver with Slack or PagerDuty for staging/production.

→ [Prometheus](./prometheus.md) · [Observability Reference](./observability-reference.md)

---

### OpenTelemetry (traces)

**What it is.** OpenTelemetry (OTel) is a vendor-neutral open standard for distributed tracing, metrics, and logs. It provides SDKs for every major language and a common wire format (OTLP). An "instrumentation" library wraps a framework (Express, Mongoose, Redis) and automatically creates "spans" for each operation.

**Problem it solves.** When a request fails it is often not obvious _which_ database query was slow, _which_ middleware threw, or _which_ downstream call timed out. Distributed tracing produces a timeline of every operation that happened inside a single request — from the HTTP entry point down to the individual MongoDB query — with durations and error attributes attached to each step.

**In this repo.** Auto-instrumentation for HTTP, Express, Mongoose, and Redis. No per-request code is needed — `startTracing()` is called once at boot before any instrumented libraries are imported. Traces are exported via OTLP/HTTP to the OTel Collector, which forwards them to Tempo.

→ [OpenTelemetry](./opentelemetry.md)

---

### OTel Collector

**What it is.** The OpenTelemetry Collector is a standalone service that receives telemetry data from applications and routes it to one or more backends. It acts as a fan-out proxy: receive once, export to many.

**Problem it solves.** If the app exports traces directly to Tempo, switching to Jaeger or a cloud vendor requires changing app code and redeploying. The collector breaks that coupling — swap backends in the collector config without touching the app. The collector can also batch, filter, and sample spans before export.

**In this repo.** Listens on `:4318` (OTLP/HTTP) and `:4317` (OTLP/gRPC). Batches spans and exports to Tempo via internal gRPC. Config lives at `.docker/observability/otel-collector.config.yaml`.

→ [OpenTelemetry](./opentelemetry.md) · [Observability Reference](./observability-reference.md)

---

### Tempo (trace storage)

**What it is.** Grafana Tempo is an open-source, horizontally scalable distributed trace storage system. It receives spans from the OTel Collector, stores them, and makes them queryable via TraceQL or by `trace_id` lookup.

**Problem it solves.** Traces can be large — a busy API produces millions of spans per day. A general-purpose database is not designed to ingest, store, and query trace data efficiently. Tempo is optimised specifically for that workload: ingest is cheap, storage is compact, and lookups by trace ID are fast.

**In this repo.** Runs in single-binary mode with local filesystem storage. Retention is 24 hours locally to keep disk usage small. All trace exploration happens through Grafana — you never query Tempo directly.

→ [Tempo](./tempo.md)

---

### Loki (log storage)

**What it is.** Grafana Loki is a log aggregation system inspired by Prometheus. Instead of full-text indexing every word in every log line (like Elasticsearch does), Loki indexes only a small set of labels (`service`, `level`, `job`) and stores the raw log lines compressed. Queries filter by label first, then scan the matching compressed chunks.

**Problem it solves.** Full-text indexed log stores (Elasticsearch) are expensive to run and scale because every word in every log line is indexed. Most log queries start with a label filter anyway (`service=api, level=error`). Loki's label-only index makes it much cheaper to operate while remaining fast for the most common query patterns.

**In this repo.** Receives log lines from Promtail. Winston writes structured JSON to stdout; the container runtime captures it to a log file; Promtail tails that file and pushes to Loki. Labels parsed: `service`, `level`, `job`. Retention is 7 days. Queried via LogQL in Grafana.

→ [Loki](./loki.md)

---

### Promtail (log shipping)

**What it is.** Promtail is Grafana's log shipper — a lightweight agent that tails log files on the host, applies pipeline transformations (parse JSON, add labels, drop noise), and pushes log entries to Loki.

**Problem it solves.** Loki does not pull logs — something must push them. Promtail sits on the host, knows where each container writes its log file, and handles the Docker vs Podman format differences without changes to the app itself.

**In this repo.** Two configs ship with the repo: one for Docker (`json-file` log driver) and one for Podman (`k8s-file` / CRI format). The correct config is selected by the `docker-compose.podman.yml` override. Config lives at `.docker/observability/promtail*.config.yaml`.

→ [Loki](./loki.md) · [Docker & Podman](./docker-and-podman.md)

---

### Grafana (UI)

**What it is.** Grafana is an open-source observability UI. It connects to data sources (Prometheus, Tempo, Loki, and many others), renders dashboards and charts from queries, and lets you explore metrics, traces, and logs side by side.

**Problem it solves.** Prometheus, Tempo, and Loki each have their own query language and their own UI. Grafana unifies them: one browser tab to explore a p95 latency spike (Prometheus), jump to the slow trace (Tempo), and read the correlated log lines (Loki) — all linked because they share a `trace_id`.

**In this repo.** Auto-provisioned with Prometheus, Tempo, and Loki datasources. Ships a starter "API Traces" dashboard. Cross-signal jumps are configured so clicking a span opens the related Loki logs. Anonymous admin access in local dev — no login required. Available at `http://localhost:3001`.

→ [Grafana](./grafana.md)

---

## Project workflow tools

### migrate-mongo (migrations)

**What it is.** migrate-mongo is a database migration runner for MongoDB. It stores each migration as a plain JavaScript file and tracks which have been applied in a `migrations_changelog` collection.

**Problem it solves.** Schema and data changes need to be reproducible across environments (dev, staging, production). Without a migration tool, every developer applies changes manually and environments drift apart. migrate-mongo gives you versioned, ordered, undoable change scripts.

**In this repo.** Migrations live in `db/migrations/`. `npm run db:migrate` applies pending ones; `npm run db:migrate:down` rolls back the last one. Config reads `NODE_DB_URI` from env.

→ [MongoDB & Mongoose](./mongodb-mongoose.md)

---

### Orval + OpenAPI Generator (client codegen)

**What it is.** Orval is a code generator that reads an OpenAPI specification and outputs typed API client code (TypeScript, React Query hooks, Zod schemas, etc.). The source of truth is `openapi.yaml`; the generated `api/` folder is a derived artifact.

**Problem it solves.** Maintaining a typed API client by hand alongside the spec means they inevitably drift. Every time a route changes, the client must be manually updated — which is error-prone and slow. Code generation makes the client an output of the spec, not a separate thing to maintain.

**In this repo.** `npm run genapi` regenerates `api/` from `openapi.yaml`. The generated client is committed so the paired frontend boilerplate can import it directly.

→ [OpenAPI Workflow](../api/openapi-workflow.md)

---

### Spectral (OpenAPI linting)

**What it is.** Spectral is a linter for API specification documents (OpenAPI, AsyncAPI, JSON Schema). It applies a ruleset to the YAML/JSON file and reports violations — missing descriptions, inconsistent response shapes, undefined error codes, etc.

**Problem it solves.** A syntactically valid OpenAPI document can still be incomplete or inconsistent — no 401 response defined, optional fields with no description, enums without documentation. Spectral catches these issues in CI before they cause runtime surprises or confuse API consumers.

**In this repo.** `npm run lint:openapi` runs Spectral against `openapi.yaml` using `.spectral.yaml`. Runs in CI after TypeScript type-check.

→ [OpenAPI Workflow](../api/openapi-workflow.md)

---

### Jest (testing)

**What it is.** Jest is a JavaScript/TypeScript testing framework that provides test runner, assertion library, mocking, code coverage, and snapshot testing in one package.

**Problem it solves.** Without automated tests, every change requires manual verification of every feature. Tests encode expectations about behaviour so regressions are caught automatically — and so future developers can refactor with confidence.

**In this repo.** Two test suites: unit tests (`npm run test:unit`) for isolated logic and integration tests (`npm run test:integration`) for HTTP endpoints against a real database. Config lives in `jest.config.json` and `tsconfig.jest.json`.

→ [Testing & Docs](./testing-and-docs.md)
