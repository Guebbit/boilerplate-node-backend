# OpenAPI

The API contract is defined in `openapi.yaml` (OpenAPI 3.0.3). This file is the source of truth — it drives code generation, mocking, and spec validation.

## Workflow

```
openapi.yaml
  ├─▶ npm run genapi        → TypeScript client in /api/
  ├─▶ npm run lint:openapi  → Spectral spec validation
  └─▶ npm run test:prism    → Mock server for frontend dev
```

## Structure of the spec

```yaml
openapi: 3.0.3
info:
    title: Boilerplate API
    version: 1.0.0
servers:
    - url: http://localhost:3000
security:
    - bearerAuth: []
paths:
    /products:
        get: { … }
        post: { … }
components:
    schemas:
        Product: { … }
    parameters:
        PageParam: { … }
    securitySchemes:
        bearerAuth:
            type: http
            scheme: bearer
```

Shared schemas and parameters are defined once under `components` and referenced everywhere with `$ref`.

## Code generation

`npm run genapi` runs `openapi-generator-cli` to produce TypeScript types and a typed API client in `/api/`. This gives you autocompletion and type safety when calling the API from tests or a frontend.

## Spec validation

`npm run lint:openapi` runs Spectral with custom rules. Keep the spec clean — it serves as the contract between backend and frontend.

## Mocking with Prism

`npm run test:prism` starts a Prism mock server on port `4010`. The frontend can develop against it before the real endpoints are implemented.
