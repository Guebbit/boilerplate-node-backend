# Package Dependencies

This page is the short map of `package.json` dependencies.
Families are grouped by purpose, and same-namespace tools stay together when that makes the mental map easier.

## Runtime dependencies

| Group | Packages | Why they exist here | Read more |
| ----- | -------- | ------------------- | --------- |
| Runtime core | `express`, `dotenv`, `zod`, `multer`, `i18next` | HTTP runtime, env loading, validation, uploads, shared text | [Runtime](./runtime.md) |
| Security family | `helmet`, `cors`, `express-rate-limit`, `jsonwebtoken`, `cookie-parser`, `bcrypt` | request guardrails, token flows, cookie access, password hashing | [Security](./security.md) |
| Mongo family | `mongodb`, `mongoose` | driver + ODM for persistence | [MongoDB & Mongoose](./mongodb-mongoose.md) |
| Redis | `redis` | cache and pub/sub invalidation | [Redis Cache](./redis-cache.md) |
| RabbitMQ | `amqplib` | async job publish/consume | [RabbitMQ](./rabbitmq.md) |
| Email + rendering | `nodemailer`, `ejs`, `puppeteer-core`, `mime-types` | transactional email, templates, PDF rendering, content types | [Email & PDF Rendering](./email-and-rendering.md) |
| WebSocket | `ws` | realtime demo transport | [WebSockets](./websockets.md) |
| Metrics | `prom-client` | Prometheus metric registry and exposition helpers | [Prometheus](./prometheus.md) |
| Logging | `winston` | app logs and audit logs | [Winston & Audit Logs](./winston.md) |
| Product analytics | `posthog-node` | optional product analytics events | [PostHog](./posthog.md) |
| OpenTelemetry family | `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-express`, `@opentelemetry/instrumentation-mongoose`, `@opentelemetry/instrumentation-redis`, `@opentelemetry/semantic-conventions` | tracing API, SDK bootstrap, OTLP export, and automatic instrumentation | [OpenTelemetry](./opentelemetry.md), [Tempo](./tempo.md), [Grafana](./grafana.md) |

## Dev dependencies

| Group | Packages | Why they exist here | Read more |
| ----- | -------- | ------------------- | --------- |
| TypeScript toolchain | `typescript`, `tsx`, `nodemon`, `jiti` | authoring, running, and reloading TS code in dev | [Runtime](./runtime.md) |
| Type definitions family | `@types/*` packages for Node, Express, Jest, AMQP, auth, uploads, mail, WebSockets, and helpers | TS types for runtime packages | — |
| Test family | `jest`, `ts-jest`, `mongodb-memory-server` | unit + integration tests with ephemeral MongoDB | [Testing & Docs](./testing-and-docs.md) |
| ESLint family | `eslint`, `typescript-eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-unicorn`, `eslint-plugin-oxlint`, `eslint-plugin-prettier`, `eslint-config-prettier`, `globals` | lint rules, TS-aware parsing, and rule composition | [Testing & Docs](./testing-and-docs.md) |
| Formatting | `prettier` | formatting checks and auto-fixes | [Testing & Docs](./testing-and-docs.md) |
| OpenAPI family | `@stoplight/prism-cli`, `@stoplight/spectral-cli`, `@stoplight/spectral-rulesets`, `openapi-typescript-codegen`, `js-yaml` | linting, mocking, and generated API client workflows | [OpenAPI Workflow](../api/openapi-workflow.md) |
| Docs family | `vitepress`, `vitepress-plugin-mermaid`, `mermaid` | docs site, diagrams, and offline search UI | [Testing & Docs](./testing-and-docs.md) |
| Database maintenance | `migrate-mongo` | migration commands and status tracking | [Package Scripts](./package-scripts.md#database--seed-scripts) |

## Quick take

- Runtime dependencies are split between **core app behavior** and **optional infrastructure**.
- Most observability and queue tooling can be disabled without breaking the basic API shape.
- Dev dependencies are heavy because this repo also ships **contract tooling**, **generated artifacts**, and a **full docs site**, not just app code.

## Related pages

- [Package Scripts](./package-scripts.md)
- [Docker & Podman](./docker-and-podman.md)
- [API](../api/)
