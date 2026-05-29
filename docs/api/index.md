# API

This section explains the API contracts and the tools around them.

## API in one view

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 50, 'rankSpacing': 65}}}%%
flowchart LR
    Spec[openapi.yaml] --> Lint[Spectral]
    Spec --> Mock[Prism / Bruno / Mockoon]
    Spec --> Types[OpenAPI Generator -> api/]
    Spec --> Impl[Routes + controllers + services]
    Impl --> Tests[Tests keep behavior honest]

    classDef contract fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef tooling fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef app fill:#dbeafe,stroke:#2563eb,color:#111827;
    class Spec contract;
    class Lint,Mock,Types tooling;
    class Impl,Tests app;
```

## What matters most here

- [`openapi.yaml`](./openapi-workflow.md#openapi-is-the-source-of-truth) is the source of truth for REST.
- [`asyncapi.yaml`](./asyncapi-workflow.md#asyncapi-is-the-async-contract-source-of-truth) is the source of truth for async contracts.
- The REST API should stay boring, predictable, and reusable.
- This is a **boilerplate contract**, so examples stay generic on purpose.
- Do **not** explode docs into one page per request or response type; keep things grouped by workflow and style.

## Read by task

| Need | Go to |
| --- | --- |
| Change the contract and related tooling | [OpenAPI Workflow](./openapi-workflow.md) |
| Change WebSocket/SSE/event contracts | [AsyncAPI Workflow](./asyncapi-workflow.md) |
| Understand route style and response patterns | [REST patterns used here](#rest-patterns-used-here) |
| Understand the app layers behind the API | [Theory / Layers](../theory/layers.md) |
| Understand runtime, cache, and observability tools around the API | [Tools](../tools/) |

## REST patterns used here

- Keep URLs resource-oriented (`/products`, `/products/:id`, `/orders/search`).
- Keep controllers thin and move reusable rules into services.
- Reuse shared schemas, parameters, and responses inside [`openapi.yaml`](./openapi-workflow.md#openapi-is-the-source-of-truth).
- Keep response handling consistent so auth, caching, metrics, and tracing can plug into the same request path.
- Treat the sample entities (`users`, `products`, `orders`, `cart`, `admin`) as examples of API patterns, not product law.
