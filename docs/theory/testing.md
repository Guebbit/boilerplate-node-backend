# Testing

## Stack

- **Jest** — test runner
- **ts-jest** — TypeScript support for Jest
- **mongodb-memory-server** — spins up a real `mongod` process in memory, no external DB needed

## Structure

```
tests/
├── helpers/
│   ├── setup.ts            # global Jest setup (starts in-memory MongoDB)
│   ├── database.ts         # connects Mongoose to the test DB
│   └── factories/          # create test documents (users, products, orders)
└── unit/
    ├── controllers/        # controller-level tests
    ├── repositories/       # repository tests (real DB, no mocks)
    └── services/           # service tests
```

## What is tested

| Layer      | How                                                                               |
| ---------- | --------------------------------------------------------------------------------- |
| Repository | Real in-memory MongoDB — queries are tested against an actual Mongoose connection |
| Service    | Real DB via repositories — business logic tested end-to-end without HTTP          |
| Controller | Isolated unit tests for specific controller behaviours                            |

## No mocked database

The repositories run against a real in-memory `mongod` instance. This catches query bugs that mocks hide — index mismatches, aggregation errors, schema defaults not applied, etc.

## Factories

`tests/helpers/factories/` provides functions to insert ready-made documents:

```ts
const product = await productFactory.create({ price: 50 });
const user = await userFactory.create({ admin: true });
```

Factories use sensible defaults so tests only specify the fields they care about.

## Running tests

```bash
npm run test                         # run all tests
npx jest tests/unit/services/products.test.ts  # run one file
```

## CI setup

If `mongod` is not available on the CI runner, run:

```bash
npm run setup:mongod
```

This pulls the `mongod` binary out of a Docker image and places it at `/tmp/mongod`. `mongodb-memory-server` picks it up automatically via the `MONGOMS_SYSTEM_BINARY` path hint in `tests/helpers/setup.ts`.
