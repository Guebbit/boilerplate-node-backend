# Project Structure

```
.
├── src/
│   ├── cluster.ts          # Entry point — forks workers if clustering is on
│   ├── app.ts              # Express app setup
│   ├── controllers/        # HTTP handlers (one file per action)
│   ├── services/           # Business logic
│   ├── repositories/       # Database queries
│   ├── models/             # Mongoose schemas + TypeScript interfaces
│   ├── routes/             # Route definitions + middleware stacks
│   ├── middlewares/        # auth-jwt, authorizations, security
│   ├── utils/              # Shared utilities (db, logger, mailer, …)
│   ├── types/              # Global TypeScript types
│   └── locales/            # i18n translation files
├── db/
│   ├── migrations/         # migrate-mongo migration scripts
│   └── seeds/              # Seed data scripts
├── tests/
│   ├── helpers/            # DB setup + data factories
│   └── unit/               # Unit tests mirroring src/ structure
├── api/                    # Auto-generated TypeScript client (from openapi.yaml)
├── public/                 # Static assets
├── views/                  # EJS templates
├── openapi.yaml            # API contract (source of truth)
└── docs/                   # This documentation (VitePress)
```

## Naming conventions

- **Files**: `kebab-case` enforced by ESLint (unicorn/filename-case).
- **Controllers**: one file per HTTP action — `get-products.ts`, `post-login.ts`, etc.
- **Interfaces**: prefixed with `I` — `IUserDocument`, `IResponseSuccess`.
- **Enums**: prefixed with `E` — `ETokenType`, `EUserScope`.

## Entry points

| File                | Purpose                           |
| ------------------- | --------------------------------- |
| `src/cluster.ts`    | Production entry — spawns workers |
| `src/app.ts`        | Single-process Express app        |
| `db/seeds/index.ts` | Database seeder                   |
