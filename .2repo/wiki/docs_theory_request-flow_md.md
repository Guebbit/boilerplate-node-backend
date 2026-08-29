# docs/theory/request-flow.md

## Purpose

Documents the end-to-end path a single HTTP request takes through the middleware chain, the four-layer module internals (controller → service → repository → model), and the shared substrates (Redis, RabbitMQ, MongoDB). Also covers the three parallel observability signal streams and the cross-cutting conventions (audit emission, validation placement, error interpretation) that every module follows.

## Key elements

- **End-to-end path diagram** — Mermaid flowchart showing Client → Middleware (Helmet, rate limiter, JWT auth) → Controller → Service → Repository → Mongoose model → MongoDB, with side channels to Redis (read-through / write-invalidate) and RabbitMQ (async jobs).
- **Observability signals diagram** — Parallel streams: OTel SDK → Collector → Tempo (traces); Winston → Promtail → Loki (logs, each line carries `trace_id`); Prometheus scrapes `/metrics`. All converge on a Grafana dashboard.
- **"What each layer does" table** — One-line responsibility per layer; clarifies that Redis short-circuits GETs before the controller, and that the controller never touches repository or model directly.
- **Audit-emission rule** — Audit actions are emitted from `service.ts` beside the write. Two explicit exceptions in `account` (`post-login`, `post-reset-request`) emit from the controller because the decision depends on a fact invisible to the service.
- **Cross-cutting strategies** — Security at the edge; Zod validation in the controller (not service); four controller helpers (`parseBody`, `rejectValidation`, `refused`, `catchAs`) as helpers rather than a wrapper; optional Redis acceleration; RabbitMQ offloading; signals everywhere.
- **Three endpoints that skip generated-schema parsing** — `post-signup`, `put-account` (dictionary-driven messages / `Content-Language` guarantee), `post-login` (uniform 401 for all credential failures; attempt must reach audit).
- **`databaseErrorInterpreter`** — Single function in `src/infrastructure/http/errors.ts` mapping driver errors (CastError, BSONError, E11000, ValidationError) to 422/409; everything else falls through to 500. Detected by `name` string, not `instanceof`; messages are literal, never the driver's.

## Relationships

- **request-input.md** — Referenced directly: the page for how a controller decides which source (params, query, body) to read and in what precedence.
- **layers.md** — The four-layer (controller/service/repository/model) structure this page traces in a single request.
- **modules.md** — The co-located directory layout (`src/modules/<name>/`) that keeps all four layers in one folder.
- **architecture.md** — Broader system context; this page is the per-request slice of that architecture.
- **clustering.md** — How the same request flow is distributed across cluster nodes.
- **account.md / account-sessions.md** — Home of the two controller-side audit exceptions documented here.
- **cart-checkout.md** — A consumer of the same flow (service emits RabbitMQ jobs for PDF/email).
- **src-infrastructure.md** — Where `parseBody`, `rejectValidation`, `refused`, `catchAs`, and `databaseErrorInterpreter` live.
- **src-app.md** — Entry point that assembles the middleware chain (Helmet, CORS, rate limiter, JWT) shown at the top of the flow.
- **tests.md** — `tests/integration/locale.test.ts` (the `Content-Language` assertion), `tests/fuzz/endpoints.fuzz.test.ts` (the `ValidationError` discovery), both cited as justification for conventions here.
- **reading-path.md / index.md** — Navigation: this page is the "follow one request" step in the recommended reading order.

## Notes

- The four controller helpers are deliberately **not** a wrapper/middleware: a wrapper would move the stack trace, degrade `parseBody`'s return-type inference, and hide the literal `.catch(` that `eslint/rules/controller-chain-must-catch.ts` greps for.
- `databaseErrorInterpreter` matches by `name` string, not `instanceof`, because `bson` and `mongoose` arrive as transitive deps of multiple packages and the wrong copy silently fails `instanceof`.
- Redis is optional acceleration: the API is fully functional with Redis down. The same applies to RabbitMQ — the HTTP response returns before the worker runs.
- The audit-emission exceptions in `account` are justified by a user-enumeration guarantee: the response is identical whether or not the account exists, so the emit must fire unconditionally (or at a point the service cannot observe).
