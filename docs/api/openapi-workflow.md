# OpenAPI Workflow

## OpenAPI is the source of truth

For this boilerplate, the safest order is:

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 50, 'rankSpacing': 65}}}%%
flowchart LR
    Idea[Need a new endpoint or payload] --> Spec[Edit openapi.yaml]
    Spec --> Lint[npm run lint:openapi]
    Spec --> Mock[npm run test:prism or Bruno/Mockoon]
    Spec --> Generate[npm run genapi]
    Generate --> Implement[Align routes, services, and responses]
    Implement --> Test[npm run test]

    classDef change fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef contract fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef tooling fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef app fill:#ede9fe,stroke:#7c3aed,color:#111827;
    class Idea change;
    class Spec contract;
    class Lint,Mock,Generate tooling;
    class Implement,Test app;
```

If the contract changes, start with the contract.
That keeps backend, generated types, and consumers in sync.

## OpenAPI vs AsyncAPI in this repository

- Use OpenAPI for REST endpoint contracts.
- Use AsyncAPI (`asyncapi.yaml`) for WebSocket/SSE/event-driven contracts.

## Tools around the contract

| Tool | Job |
| --- | --- |
| [`openapi.yaml`](https://spec.openapis.org/oas/latest.html) | single contract file (OpenAPI 3.x specification) |
| [Spectral](https://stoplight.io/open-source/spectral) | lint the spec against `spectral.yaml` rules |
| [orval](https://orval.dev) | generate `api/` types and fetch clients from the spec |
| [Prism](https://stoplight.io/open-source/prism) | mock the API from the spec |
| [Bruno](https://www.usebruno.com/) / [Mockoon](https://mockoon.com/) / [Insomnia](https://insomnia.rest/) | explore or fake the API during development |

## Generated output (`api/`)

Running `npm run genapi` regenerates the entire `api/` directory. **Never edit files inside `api/` manually** — changes will be overwritten.

```
api/
├── index.ts          ← fetch client functions (one per operation)
└── models/
    ├── index.ts      ← barrel re-export of all types and enum consts
    └── *.ts          ← one file per schema or enum
```

**Importing generated types** — always go through the `@types` alias, which re-exports everything from `@api/models`:

```typescript
import type { CreateProductRequest, Product } from '@types';
```

**Importing enum const objects** — orval generates enums as `as const` objects (not TypeScript enum declarations). Import the const object to use it with `z.nativeEnum()` or for runtime value checks:

```typescript
import { UpdateFeedbackRequestStatusRequestStatus } from '@types';

z.nativeEnum(UpdateFeedbackRequestStatusRequestStatus)
```

The enum naming convention is: schema name + property name, PascalCase. For example, `UpdateFeedbackRequestStatusRequest.status` → `UpdateFeedbackRequestStatusRequestStatus`.

## Commands used in this repo

```bash
npm run lint:openapi      # lint openapi.yaml with Spectral
npm run genapi            # regenerate api/ from openapi.yaml via orval
npm run test:prism        # smoke-test Prism mock server against the spec
```

## Orval configuration

`orval.config.ts` at the project root controls code generation:

- `input.target` — source spec (`./openapi.yaml`)
- `output.target` — generated fetch client (`./api/index.ts`)
- `output.schemas` — generated types (`./api/models/`)
- `output.client` — generator mode (`fetch`)
- `output.mode` — `single` (one client file, all operations)

Changing the mode to `tags-split` generates one file per OpenAPI tag instead.

## How this connects to the rest of the docs

- [Theory / Layers](../theory/layers.md) explains where implementation code lands after the spec changes.
- [Tools](../tools/) explains the non-OpenAPI dependencies around the API runtime.
- [API overview](./index.md#rest-patterns-used-here) summarizes the style choices used by the contract.

## What to document here

Document:

- source of truth rules,
- contract workflow,
- REST conventions,
- mock/codegen usage.

Do **not** create a page for every tiny request or response object.
Those belong in the spec itself.

## Useful links

- [OpenAPI 3.1 specification](https://spec.openapis.org/oas/v3.1.0)
- [Swagger guide](https://swagger.io/docs/specification/about/)
- [OpenAPI Initiative on GitHub](https://github.com/OAI/OpenAPI-Specification)
- [Spectral rulesets](https://docs.stoplight.io/docs/spectral/01baf06bdd05a-rulesets) — basis for `spectral.yaml`
- [Prism mock options](https://docs.stoplight.io/docs/prism/83dbbd75532cf-http-mocking)
- [orval documentation](https://orval.dev/guides/overview)
- [orval configuration reference](https://orval.dev/reference/configuration/overview)
