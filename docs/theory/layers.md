# Layers

This page re-adds the app layers in a simple way.
Use it when you want the **mental map of the folders** without reading every source file.

## Layer stack

```mermaid
flowchart TD
    A[src/routes] --> B[src/middlewares]
    B --> C[src/controllers]
    C --> D[src/services]
    D --> E[src/repositories]
    E --> F[src/models]
    F --> G[(MongoDB)]
```

## Quick map

| Layer        | Folder             | Main job                                             |
| ------------ | ------------------ | ---------------------------------------------------- |
| Routes       | `src/routes`       | match URLs and attach middleware                     |
| Middlewares  | `src/middlewares`  | auth, authorization, rate limit, request guards      |
| Controllers  | `src/controllers`  | parse request, call services, send response          |
| Services     | `src/services`     | business rules and orchestration                     |
| Repositories | `src/repositories` | persistence queries                                  |
| Models       | `src/models`       | Mongoose schema/types                                |
| Utils        | `src/utils`        | shared helpers such as cache, logs, metrics, tracing |

## How to read a feature

```mermaid
flowchart LR
    Route[Route file] --> Controller[Controller handler]
    Controller --> Service[Service method]
    Service --> Repository[Repository query]
    Repository --> Model[Mongoose model]
```

### Example from this repo

For a product flow you usually move through:

- `src/routes/products.ts`
- `src/controllers/products/*`
- `src/services/products.ts`
- `src/repositories/products.ts`
- `src/models/products.ts`

That same shape is the real value of the boilerplate.
The entity names are examples.

## What each layer should not do

- Routes should not hide business logic.
- Controllers should not become query-heavy.
- Services should not depend on Express response objects.
- Repositories should not decide HTTP status codes.
- Models should not know route behavior.

## Why this is useful

- easier tests
- easier refactors
- easier stack swaps later
- easier onboarding when ADHD brain wants clear buckets

## Related pages

- [Architecture](./architecture.md)
- [Request Flow](./request-flow.md)
- [Runtime](../tools/runtime.md)
- [REST Style](../api/rest-style.md)
