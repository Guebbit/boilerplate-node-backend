---
type: concept
audience: [developer, architect]
---

# Strategic DDD: subdomains

Where to spend effort, and the foundation/shop split.

## 4. Subdomain distillation — where to spend effort

DDD's own advice is the part most often skipped: spend the modelling effort where the business
differs, and use the simplest thing that works everywhere else.

- The **expensive** tactical patterns — entities, aggregates, domain repositories, invariants at
  construction — are what `core` would earn. Outside `core` they are a signal to re-check the label or
  the build-vs-buy call, not a ban: how much logic a module has picks the pattern, the label only
  predicts it (Khononov, _Learning Domain-Driven Design_, ch. 10).
- The **cheap** two this repo already uses, `Money` and a transition table, go wherever the rule lives:
  `tasks` and `example` (`generic`) and `payments`, `delivery` and `returns` (`supporting`) all carry tables.
  No `core` module has an aggregate today.

| Subdomain    | Meaning                                                         | Here, for example                           |
| ------------ | --------------------------------------------------------------- | ------------------------------------------- |
| `core`       | the reason the product exists — worth entities and invariants   | `products`, `orders`, `cart`                |
| `supporting` | specific to this business, not a differentiator — keep it plain | `payments`, `delivery`, `inventory`         |
| `generic`    | a solved problem, interchangeable with something bought         | `antibot`, `audit-logs`, `locales`, `users` |

[The map](../modules/start.md#the-map) colours every module by its subdomain.

The rule that follows: **the label sets how much modelling a module earns; the complexity of its logic
picks the pattern; any rule that clears
[the floor](./domain-layer.md#the-floor-testable-without-a-database-is-necessary-not-sufficient)
goes in `domain/`, whatever the label.**

- Where the pure rules live is a separate question from which pattern the module uses. A `domain/` of
  pure functions is not a tactical pattern: it is a functional core inside an imperative shell, and any
  pattern, even a Transaction Script, can have one. `account` (`generic`) keeps its session-revocation
  and email-change rules there.
- Evans says the same from the other side: a generic subdomain still gets its own model, and the label
  sets priority and buy-versus-build ([DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)).
- Keep the useful half of the old rule as a smell, not a ban: expect a generic module's `domain/` to be
  small. A large one says the label, or the build-vs-buy call, is wrong.

::: warning These values are an example, not a finding
A boilerplate has no core domain. It cannot know what the next project's will be, and what it ships
— products, orders, cart — is the textbook case of a _generic_ subdomain dressed as a core one. The
mechanism is the deliverable; the first thing a real project should do is re-decide every row of
that table.
:::

This table keeps the definitions; the values themselves live on each module's own
`module.yaml#subdomain` and are read from there into the generated map at `docs/modules/start.md`
(`npm run regenerate`) — so the table above is illustrative, not the source of truth for any one
module's label. The strict schema (`npm run check`, module-graph step) only holds `subdomain` to being one
of the three names; it does not check that a classification stays HONEST (nothing stops every module
drifting to `core`). Placing the value with
the module it describes is still worth doing, since a doc table can go stale the moment a new module
lands and nothing points back at it; it is not a claim that the label is enforced beyond its spelling.

## 4a. Foundation and shop — an enforced fact, not a naming convention {#4a-foundation-and-shop}

The API docs' "Core" family is the platform (every `group: foundation` module), NOT the DDD core
subdomain: products, orders and cart are the core subdomain here and sit under "Catalogue" and "Buying".

Subdomain distillation (§4) asks "how much modelling effort does this deserve". A second, separate
question asks "does this module ship with every deployment, or is it the demo shop's own worked
example" — `module.yaml#group`, `foundation | shop | example`.

The two axes are independent: `access` is `generic` (§4) AND `foundation` (this section);
`payments` is `supporting` AND `shop`. Neither implies the other.

| Group        | Meaning                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `foundation` | ships with every deployment, whatever the next project turns this boilerplate into                        |
| `shop`       | the demo e-commerce domain's own worked example — deletable on its own                                    |
| `example`    | the one module that exists only to be copied; see [the module template](./modules.md#the-module-template) |

Unlike `subdomain`, this line is **enforced, not aspirational**:
`.dependency-cruiser.cjs`'s `foundation-cannot-reach-shop` rule fails closed on a `foundation`
module importing a `shop` one, the same way `module-coupling-<name>` fails closed on an
undeclared sibling import. `webhooks` is labelled `foundation`: delivery, retries and signing are
generic, and each module declares its own public events on its manifest (`publicEvents`,
`kernel/registry.ts`'s `resolvePublicEvents`), so `webhooks` subscribes to whatever is registered
instead of importing `orders`/`payments` event constants directly. The `example` group has two
rules of its own: `nothing-reaches-example` (no other module may reach it, so deleting it breaks
nothing) and `example-cannot-reach-shop` (it uses the foundation and nothing of the demo shop, so
either can be deleted without the other). `demo:remove` deletes both groups: `example` is mounted
in production, so a deployment copies it first and then removes it.

## Read next

- [strategic-ddd](./strategic-ddd.md): the hub this page belongs to.
