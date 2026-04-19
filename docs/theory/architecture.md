# Architecture

## Layered architecture

This boilerplate follows a strict three-layer separation:

```
Controller  →  Service  →  Repository
(HTTP)         (Logic)      (Database)
```

Each layer has a single responsibility and depends only on the layer below it. This makes each layer independently testable and easy to replace.

| Layer      | Knows about               | Does NOT know about     |
| ---------- | ------------------------- | ----------------------- |
| Controller | HTTP, request/response    | Business rules, MongoDB |
| Service    | Business rules, Zod, auth | HTTP, Mongoose queries  |
| Repository | Mongoose, MongoDB         | HTTP, business rules    |

## Dependency direction

```
routes → controller → service → repository → model
```

No layer imports from a layer above it. Models are imported only by repositories.

## Horizontal slicing (by domain)

Each domain (products, users, orders) has its own controller, service, repository, and model files. Adding a new domain means adding files in each layer without touching existing ones.

## Why not a monolith controller?

Putting everything in the controller is common in small projects but creates problems at scale:

- Business logic becomes untestable without an HTTP server
- Duplicated query code across controllers
- Hard to enforce authorization rules consistently

The three-layer approach solves all of these.

## Clustering

`src/cluster.ts` uses Node.js `cluster` to fork one worker process per CPU core when `NODE_ENABLE_CLUSTERING=1`. Each worker runs the full Express app. The master process restarts dead workers automatically.

This is a simple, zero-dependency way to utilize multiple cores without introducing a reverse proxy.
