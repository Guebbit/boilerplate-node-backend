# feedback

::: tip At a glance
**Owns** — contact requests: anyone may file one, admins read and triage them.
**Depends on** — nothing, and nothing depends on it. A leaf in both directions.
**Breaks if you change** — the `status` enum, which is the whole triage workflow.
:::

<!-- gen:identity:start -->

| Fact                     | This module                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| **Subdomain**            | `generic` — A solved problem. Modelling effort here would be waste. |
| **Base path**            | `/feedback`                                                         |
| **Collection**           | `feedbackrequests` (model `FeedbackRequest`)                        |
| **Depends on**           | _nothing_                                                           |
| **Depended on by**       | _nothing_                                                           |
| **Languages**            | `en` · `it`                                                         |
| **Seeded**               | no                                                                  |
| **Frontend counterpart** | `feedback` in `boilerplate-vue-frontend`                            |

::: info Stands alone
No module depends on this one and it depends on none. Deleting the folder and its line in `src/modules.ts` costs nothing else.
:::

<!-- gen:identity:end -->

## The map

<!-- gen:map:start -->

`feedback` sits on no edge of the context map — nothing imports it and it imports nothing.

<!-- gen:map:end -->

## The story

**It records an email address rather than referencing a user**, because the form is open to people
who have no account. That one decision explains everything else about this module: it needs nothing
from [`users`](./users.md), deleting an account leaves that person's feedback standing, and the
public write route is the only unauthenticated write in the application.

The status enum _is_ the triage workflow: `new → in_progress → resolved`, with `spam` as the exit
that is neither. `adminNotes` and `respondedAt` are the operator's side of the record, never served
to the person who filed it.

::: tip A leaf in both directions
Zero dependencies and zero dependents. Together with [`wishlist`](./wishlist.md) it is the pair to
read when you want to see what the module system looks like with none of the interesting coupling
in the way.
:::

The `status: 1, createdAt: -1` index is the admin queue, which is the only list anyone ever asks
for.

## Data

<!-- gen:data:start -->

#### `feedbackrequests`

From model `FeedbackRequest`. `_id` and `__v` are omitted — every document carries them.

| Field         | Type     | Flags    | Default | Reference / values                             |
| ------------- | -------- | -------- | ------- | ---------------------------------------------- |
| `name`        | `String` | —        | —       | —                                              |
| `email`       | `String` | required | —       | —                                              |
| `subject`     | `String` | required | —       | —                                              |
| `message`     | `String` | required | —       | —                                              |
| `status`      | `String` | —        | "new"   | `new` \| `in_progress` \| `resolved` \| `spam` |
| `adminNotes`  | `String` | —        | —       | —                                              |
| `respondedAt` | `Date`   | —        | —       | —                                              |
| `createdAt`   | `Date`   | —        | —       | —                                              |
| `updatedAt`   | `Date`   | —        | —       | —                                              |

**Declared indexes**

| Keys                       | Options |
| -------------------------- | ------- |
| `status: 1, createdAt: -1` | —       |

<!-- gen:data:end -->

## Surface

<!-- gen:surface:start -->

| Endpoint                 | Middlewares                                   | Controller            | What it does                   |
| ------------------------ | --------------------------------------------- | --------------------- | ------------------------------ |
| `GET /feedback`          | `getAuth` → `isAuth` → `isAdmin` → `(inline)` | `getFeedback`         | List feedback requests         |
| `PUT /feedback/{id}`     | `getAuth` → `isAuth` → `isAdmin` → `(inline)` | `putFeedbackStatus`   | Update feedback request status |
| `POST /feedback/contact` | `getAuth` → `isAuth` → `isAdmin` → `(inline)` | `postFeedbackContact` | Submit contact request         |

Middlewares run left to right; the controller is the last handler on the route. Summaries come from this module’s own `openapi.yaml`, which is where they are edited.

<!-- gen:surface:end -->

## Signals

<!-- gen:signals:start -->

#### Audit actions

| Constant                        | Action name                     |
| ------------------------------- | ------------------------------- |
| `ADMIN_FEEDBACK_VIEWED`         | `admin.feedback.viewed`         |
| `ADMIN_FEEDBACK_STATUS_UPDATED` | `admin.feedback.status_updated` |

<!-- gen:signals:end -->

## Files

<!-- gen:files:start -->

| File                                   | What it is                                                                                                                                                   | Explained in                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `audit.ts`                             | Which of this module’s operations reach the audit trail, and under what action names.                                                                        | [read](../tools/winston.md)              |
| `controllers/get-feedback.ts`          | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/post-feedback-contact.ts` | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/put-feedback-status.ts`   | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `emails.ts`                            | Which templates this module sends and what they are given.                                                                                                   | [read](../tools/email-and-rendering.md)  |
| `locales/en.json`                      | This module's user-facing strings, one file per language.                                                                                                    | [read](../tools/i18n.md)                 |
| `locales/it.json`                      | This module's user-facing strings, one file per language.                                                                                                    | [read](../tools/i18n.md)                 |
| `model.ts`                             | The Mongoose schema, its indexes and its serialisation rules — the collection's shape.                                                                       | [read](../tools/mongodb-mongoose.md)     |
| `module.ts`                            | The manifest — the only file the application loads directly. Declares the name, base path, router, dependency edges, locales, seeds and event subscriptions. | [read](../theory/modules.md)             |
| `openapi.yaml`                         | This module's slice of the REST contract. The root `openapi.yaml` is bundled from these.                                                                     | [read](../api/contract-fragmentation.md) |
| `repository.ts`                        | Every query this module makes, on the shared base repository. The only tier that talks to Mongoose.                                                          | [read](../tools/mongodb-mongoose.md)     |
| `routes.ts`                            | The URL surface — one line per endpoint, naming its middlewares, the role it requires and the controller it lands on.                                        | [read](../api/endpoints.md)              |
| `service.ts`                           | The domain decision, and the layer that owns status-code meaning.                                                                                            | [read](../theory/layers.md)              |
| `tests/contract/api.contract.test.ts`  | Contract suite — the responses, against the fragment.                                                                                                        | [read](../tools/contract-testing.md)     |
| `tests/unit/audit.test.ts`             | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |
| `tests/unit/model.test.ts`             | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |
| `tests/unit/schema-contract.test.ts`   | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |
| `tests/unit/service.test.ts`           | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |

<!-- gen:files:end -->

## Working on it

<!-- gen:working:start -->

| Suite    | Files | Where                                  |
| -------- | ----- | -------------------------------------- |
| Unit     | 4     | `src/modules/feedback/tests/unit/`     |
| Contract | 1     | `src/modules/feedback/tests/contract/` |

```bash
# every suite this module carries
npm run test:module -- src/modules/feedback

# after editing this module’s openapi.yaml
npm run contracts:bundle && npm run lint:openapi:modules
```

<!-- gen:working:end -->

## Deeper in

<!-- gen:subpages:start -->

Nothing in this domain needs a page of its own — the story above is the whole of it.

<!-- gen:subpages:end -->

## Related pages

- [Modules overview](./index.md) — the whole context map
- [Email & PDF Rendering](../tools/email-and-rendering.md) — the acknowledgement and the triage notification
- [Security](../tools/security.md) — rate limiting on the one public write
- [Winston & Audit Logs](../tools/winston.md) — what a triage action records
