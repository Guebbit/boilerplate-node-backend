# boilerplate-node-backend

Node basic server boilerplate — OpenAPI-first, TypeScript, Express, MongoDB.

---

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

---

## Logging

### Development (default)

`morgan` "dev" coloured request logs + Winston pretty console output. No raw OTel objects.

```
22:00:01 [api] info: Server listening on 0.0.0.0:3000
GET /health 200 1.234 ms - 27
```

### Production

Both `morgan` and Winston write structured **JSON** to stdout, ready for Loki/CloudWatch/Datadog ingestion.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `NODE_LOG_LEVEL` | `debug` (dev) / `warn` (prod) | Winston log level |
| `NODE_SERVICE_NAME` | `api` | Service tag in logs |
| `NODE_LOKI_HOST` | *(unset)* | Enable Loki push gateway (e.g. `http://loki:3100`) |

---

## OpenTelemetry / Tracing

### Exporter defaults

| Environment | `OTEL_ENABLED` default | `OTEL_EXPORTER` default | Result |
|---|---|---|---|
| `development` | `false` | `none` | **No spans, no noise** |
| `production` | `true` | `otlp` | Spans sent to Tempo via OTLP/HTTP |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `OTEL_ENABLED` | `false` in dev, `true` in prod | Master on/off switch |
| `OTEL_EXPORTER` | `none` in dev, `otlp` in prod | `none` / `console` / `otlp` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP endpoint URL (Tempo) |
| `DEBUG_TELEMETRY` | `false` | Set `true` to dump raw spans to stdout |

> **ConsoleSpanExporter** is only active when **both** `OTEL_EXPORTER=console`
> **and** `DEBUG_TELEMETRY=true`. This prevents raw OTel span objects polluting
> local dev logs by accident.

---

## Tempo + Grafana (local observability stack)

Start the local stack:

```bash
docker compose -f docker-compose.observability.yml up -d
```

Then add to your `.env`:

```env
OTEL_ENABLED=true
OTEL_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Viewing traces in Grafana

1. Open **http://localhost:3001** — default credentials are `admin/admin`
   (**change these before exposing the service publicly**).
2. Go to **Explore** → select the **Tempo** data source.
3. Search by **Service Name** (`api`) or paste a `traceId` from a log line.

---

## HTTP error handling policy

| Status | Meaning | Log level | Frontend action |
|---|---|---|---|
| 400 | Bad request / validation error | `warn` | Show validation message |
| **401** | **Not authenticated** | `warn` | **Redirect to login — NOT a 500 page** |
| 403 | Authenticated but not authorised | `warn` | Show "Access denied" |
| 404 | Resource not found | `warn` | Show "Not found" |
| 422 | Business rule violation | `warn` | Show domain error message |
| **500** | Unexpected server error | **`error`** | **Show error/500 page + alert ops** |

> Frontends should **only** show an error/500 page for actual 5xx responses.
> A 401 must redirect to the login flow.

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled output |
| `npm run ts-check` | Type-check without emitting |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |

---

## Environment variable reference

See [`.env.example`](.env.example) for the full annotated list.
