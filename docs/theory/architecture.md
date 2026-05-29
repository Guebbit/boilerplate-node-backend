# Architecture

Use this page for the **big blocks and their boundaries**.
If you want the exact folder order, jump to [Layers](./layers.md).

## Architecture frame

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 75}}}%%
flowchart LR
    Contract[Contracts\nOpenAPI + AsyncAPI] --> Entry[HTTP + realtime entry]
    Entry --> Core[Business core\ncontrollers + services]
    Core --> Data[Persistence\nrepositories + models]
    Data --> Storage[(MongoDB)]

    Security[Security guardrails] --> Entry
    Observability[Logs + metrics + traces] --> Entry
    Observability --> Core
    Async[Queue + realtime adapters] --> Core

    classDef contract fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef app fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef data fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef ops fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class Contract contract;
    class Entry,Core app;
    class Data,Storage data;
    class Security,Observability,Async ops;
```

## What each block owns

| Block               | Owns                                                 | Avoids                  |
| ------------------- | ---------------------------------------------------- | ----------------------- |
| Contract layer      | public request/event shapes and source-of-truth docs | hidden behavior drift   |
| Entry layer         | routes, middlewares, protocol glue, auth gates       | deep business decisions |
| Business core       | orchestration, validation, reusable rules            | Express or AMQP details |
| Persistence         | query shape, schema mapping, storage access          | HTTP response logic     |
| Cross-cutting tools | logs, traces, metrics, queues, cache hooks           | owning product rules    |

## Why this page exists next to Layers

- **Architecture** answers: “which major blocks talk to each other?”
- **Layers** answers: “which folder/file path do I open next?”

Keeping those separate reduces repetition and makes scanning faster.

## Why this matters in a boilerplate

A boilerplate should be easy to copy, swap piece by piece, test in isolation, and extend without turning one file into a giant blob.
That is why the repo favors **clear ownership lines** instead of controller-heavy code.

## Design rules used here

- **SOLID**: each layer should have one main reason to change.
- **DRY**: shared logic belongs in services, repositories, or utilities.
- **KISS**: keep flows boring and predictable.
- **Future proof**: prefer seams where a database or framework could be swapped later.

## Related pages

- See [Layers](./layers.md) for the exact folder stack.
- See [Request Flow](./request-flow.md) for the live path of one endpoint.
- See [Runtime](../tools/runtime.md) and [MongoDB & Mongoose](../tools/mongodb-mongoose.md) for the libraries enabling this shape.
- See [OpenAPI Workflow](../api/openapi-workflow.md) for how the contract drives implementation.
