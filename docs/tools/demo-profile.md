# The demo profile

The real API, booted self-contained and disposable:

```sh
npm run demo               # :3000 — in-memory Mongo, seeded, cache/queue disabled
NODE_PORT=3101 npm run demo   # several run side by side; each owns its own database
```

One process, no Docker: `scripts/run-demo-server.ts` starts a `mongodb-memory-server` (the same dependency the test suite already uses), points `NODE_DB_URI` at it, force-disables Redis and RabbitMQ — a supported deployment shape that `/observability/health` reports as `disabled` rather than as an error — raises the rate limits to the test allowance, and boots `src/app.ts` exactly as any other profile would. Every enabled module's demo fixtures (`src/modules/<name>/demo.ts`) are seeded at boot. Kill the process and nothing survives it.

## Who it is for

**The paired frontend, mostly.** `boilerplate-vue-frontend`'s dev server and its default e2e suite run against this profile instead of a hand-written mock of this API — its shard runner boots one instance per shard (ports 3101+), so four Cypress processes each own a private universe. That is the deal the two repos struck when the frontend retired its MSW layer: one implementation of the behaviour, served by the code that owns it, with determinism coming from the seeds rather than from an imitation. See the frontend's `docs/tools/demo-profile.md` for its half of the story, and [Testing & Docs](./testing-and-docs.md) for what the pairing catches.

It is also the lightest way for a human to get a working API for anything — a quick curl, a schema check, a demo on a machine with nothing but Node.

## The control surface

`NODE_DEMO=true` (set by `npm run demo`, and by nothing else) additionally mounts two routes, before the 404 catch-all and inert in every other profile:

| Route                | What it does                                                                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /__demo/reset` | Drop the database, reseed from the modules' demo fixtures, clear the outbox — the deterministic start-of-spec state, in-process and fast enough to run once per e2e spec                                                                                                                                               |
| `GET /__demo/emails` | The emails the app "sent" since the last reset. In demo mode the mailer (`src/infrastructure/adapters/mailer.ts`) records to an in-memory outbox (`demo-outbox.ts`) instead of talking to SMTP, with the reset/verify token lifted out of the link — a password-reset spec is the token in the email, or it is nothing |

The routes are unauthenticated on purpose: the profile only ever binds beside an in-memory database that `npm run demo` created seconds earlier. There is nothing to protect and no deployment that mounts them — `NODE_DEMO` is not read from any `.env` example, compose file or Dockerfile.

## The two seed accounts

Their ids and credentials live in `src/kernel/seed-accounts.ts` — in the kernel rather than in
`users`, even though `users` owns the record.

Four modules need a piece of them and only one owns it: `users` seeds the accounts, `orders` stores
the address an order was sent to, and `cart` and `wishlist` each seed a row belonging to a person.
Reaching into `@modules/users` for that would buy three new registry edges — one of them a
`shared-kernel` — in exchange for six string literals that are pure data. Repeating the ids in four
files is worse in the other direction: a drift is a dangling reference nothing catches until a demo
renders an empty page.

Note what is deliberately **not** shared: the account records. A sibling gets the handle it needs to
name a person without taking on the shape of a user.

::: warning Two things not to change
**The credentials must stay fixed.** `cy.loginAs()` in the paired frontend types them into a real
login form. Everything else about the dataset can move; these are the part a human reads off a
page and types. The passwords are overridable via `NODE_SEED_ADMIN_PASSWORD`/
`NODE_SEED_USER_PASSWORD` — change both `.env` files together, never one alone.

**The password is stored plaintext on purpose.** `userSchema`'s pre-save hook hashes it on the way
in, so a hash written there would drift from that hook and lose its plaintext. It never reaches a
response — `password` is `select: false` and the user transform omits it — which is why
`scripts/export-demo-dataset.ts` carries these into `demo-data.json` separately rather than reading them
back off a serialized user.
:::

## What it deliberately is not

- **Not the full stack.** Cache and queue run `disabled`, so invalidation behaviour and the queue-backed email/PDF paths are not exercised. That is the live profile's job — the frontend's `test:e2e:live` against `compose:restart`, which its CI requires on every PR.
- **Not persistent.** `db:seed` against the compose stack is the path that survives a restart; this one is a fresh world per process, which is precisely what makes it a test fixture.
- **Not a mock.** Nothing here imitates anything: same routes, same validators, same serializers, same visibility rules as production. When a demo-profile answer surprises you, believe it — that is the API.
