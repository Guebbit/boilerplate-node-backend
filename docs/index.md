---
layout: home
hero:
    name: Node API Boilerplate
    text: NestJS · Fastify · MongoDB · Mongoose
    tagline: A production-ready REST API starter with a clean layered architecture.
    actions:
        - theme: brand
          text: Get Started
          link: /guide/getting-started
        - theme: alt
          text: Endpoint Lifecycle
          link: /guide/endpoint-lifecycle
features:
    - title: Layered Architecture
      details: NestJS app bootstrap + Controller → Service → Repository separation keeps each concern isolated and testable.
    - title: Fast runtime
      details: Fastify handles the HTTP runtime while NestJS provides scalable project structure for larger backends.
    - title: OpenAPI-first
      details: The API contract lives in openapi.yaml and drives code generation, mocking, and validation.
    - title: Auth out of the box
      details: JWT access tokens + refresh tokens with per-session revocation already wired up.
    - title: Ready for production
      details: Clustering, rate limiting, soft deletes, migrations, seeds, structured logging — all included.
---
