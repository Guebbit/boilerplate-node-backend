# Tools

This section explains **why dependencies exist**.

> OpenAPI-specific tools are documented in [API](../api/), not here.

## Tool map

```mermaid
flowchart TD
    A[Boilerplate tools] --> B[Runtime]
    A --> C[Security]
    A --> D[Observability]
    A --> E[Quality]
    A --> F[Docs]

    B --> B1[Express]
    B --> B2[MongoDB + Mongoose]
    B --> B3[Redis]
    B --> B4[Zod]

    C --> C1[Helmet]
    C --> C2[CORS]
    C --> C3[express-rate-limit]
    C --> C4[JWT + cookies + sessions]

    D --> D1[Winston]
    D --> D2[Prometheus]
    D --> D3[OpenTelemetry]
    D --> D4[Loki]
    D --> D5[PostHog]

    E --> E1[Jest]
    E --> E2[ESLint]
    E --> E3[Prettier]

    F --> F1[VitePress]
    F --> F2[Mermaid]
```

## Read by intent

| Need | Go to |
| --- | --- |
| Understand runtime and security dependencies | [Runtime & Security](./runtime-and-security.md) |
| Understand logging, metrics, tracing, testing, and docs tooling | [Observability & Quality](./observability-and-quality.md) |
| Understand OpenAPI Generator, Spectral, Prism, Bruno, or Mockoon | [API](../api/) |

## Boilerplate reminder

These tools are here as **good defaults and examples**.
Use them as building blocks, not as rules that every future project must copy 1:1.
