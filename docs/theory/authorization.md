# Authorization

**Who may act, how strongly they proved it, and which rows they see.** Three separate questions,
answered by three separate things — and confusing them is how a system ends up with forty roles.

[Web attack defences](./web-attack-defences.md) covers keeping the wrong person out.
This page is about what the right person is allowed to do once they are in.

## The three axes

| Axis                            | Answers                             | Where it lives                                                      |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| **Who they are**                | may this caller act at all?         | the keys their role holds — `holdsKey`, behind `requirePermission`  |
| **How strongly they proved it** | did they prove it _recently_?       | `amr` on the token + the freshness guards                           |
| **Which rows**                  | of the things they may read, which? | `kernel/access/query.ts` — the same rules, compiled into the filter |

The middle axis is the one most applications never build. This one has it: the `amr` claim
(RFC 8176) and a `stepUp` tier let a high-risk action demand a recently proved session rather than
merely a valid one. The tier is declared on the KEY, so a new route guarding that key inherits it
instead of having to remember it.

## The rule that everything else is arranged around

> The restriction has to ride **IN** the read.

Fetching a row and _then_ checking its owner is how a scoped find turns into a leak. It opens a
window between the check and whatever uses the document, and it lets _"not yours"_ and _"does not
exist"_ answer differently — which is a disclosure on its own, because a 403 confirms the row is
there.

So `accessibleFilter` returns a **query fragment**, not a verdict, and every scoped read spreads it
into its own find. That property is what picks the library: `@casl/ability` rules compile straight
into a Mongo query, and anything that answers yes/no about a document already in memory is a
downgrade.

The fail-closed detail is worth ten seconds. Rules that match nothing compile to CASL's
`EMPTY_RESULT_QUERY` — a filter matching no row — never to an absent filter, which every caller
downstream would read as "unrestricted". **A gap here returns an empty list, never somebody else's
data.**

## The model

**RBAC scoped by tenant, with conditions on the resource.** The role decides whether you may act,
the conditions its keys carry decide which rows, and those conditions compile into the query so the
rule above survives. One boolean cannot do that job: two callers can be administrators of
_different_ things, and `admin: true` cannot say which.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 50}}}%%
flowchart TD
    accTitle: How a caller becomes an authorization decision
    accDescr: A member holds a role in one tenant, or a platform operator holds a role with platform-prefixed keys. Either way the request resolves to a single caller, which resolves to one ability, which is used in three places - the route guard, the database query, and the rule set sent to the client.

    subgraph TENANT["tenant scope"]
        M["<b>Member</b>"] -->|has| RT["<b>Role</b>"]
        RT -->|holds| KT["permission keys<br/><i>knowledge.read</i>"]
    end
    subgraph PLATFORM["platform scope"]
        PO["<b>PlatformOperator</b>"] -->|has| RP["<b>Role</b>"]
        RP -->|holds| KP["platform.* keys<br/><i>platform.taxonomy.merge</i>"]
    end

    KT --> C["<b>one Caller</b><br/>id · tenantId · scope · permissions"]
    KP --> C
    C --> A["<b>Ability</b><br/><i>role keys + resource conditions,<br/>resolved per request</i>"]

    A --> G["<b>route guard</b><br/><i>may I act?</i>"]
    A --> Q["<b>compiled into the query</b><br/><i>which rows?</i>"]
    A --> W["<b>packed and sent to the client</b><br/><i>what to grey out</i>"]

    classDef actor fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef key fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef core fill:#ddd6fe,stroke:#7c3aed,color:#111827;
    classDef use fill:#dcfce7,stroke:#16a34a,color:#111827;
    class M,PO,RT,RP actor;
    class KT,KP key;
    class C,A core;
    class G,Q,W use;
```

Read it as one sentence: **a role is a bundle of keys, a caller is one scope's worth of keys, and
the ability those keys produce is used in three places that can never disagree — because there is
only one of it.**

The third arrow is the one people miss. The frontend gets the _same_ rules the server enforces, so
"what to grey out" stops being a hand-maintained duplicate that drifts. It still has no authority:
it decides what to render, never what is allowed, and every request is re-evaluated server-side.

### The key grammar, and the invariant it exists for

```
tenant scope     <subject>.<action>            knowledge.read · tasks.write · members.invite
platform scope   platform.<subject>.<action>   platform.taxonomy.merge
wildcards        <subject>.manage              any action on that subject
                 all.manage                    everything in this scope — never both scopes
```

**Tenant keys are bare; platform keys are always prefixed.** That asymmetry is the whole safety
property:

> A bare key can never be satisfied by a platform-scope caller, and a `platform.` key can never be
> satisfied by a tenant-scope caller.

A platform operator administers shared reference data and is **not** a super-member — they cannot
read one tenant's content. Mapping that person onto a single `admin` flag is one line to write, passes
every test that exists today, and is a total confidentiality failure. The grammar makes it
unrepresentable rather than discouraged.

Three supporting rules: keys are lower-case, dotted and **stable** (renaming one is a migration); a
**module declares its own keys in its manifest**, so deleting a module deletes its keys; and
**roles are data, permissions are code** — a deployment may create roles at runtime and may never
invent a key, because a key nothing checks grants nothing while looking like it grants something.

## Where it lives

The model is stored, evaluated, compiled into every scoped read, published to the client and
enforced per key.

- **`shared/authorization-keys.yaml`** — every key, its subject, scope, conditions and step-up
  tier. **`-roles.yaml`** — the presets both seeders read. **`-conformance.yaml`** — dozens of
  cases, most of them denials, run by both backends. All three byte-identical in the PHP twin.
- **`kernel/permissions.ts`** turns an account's two role names into the keys for ONE scope;
  **`kernel/ability.ts`** builds the CASL ability and answers `holdsKey`.
- **`kernel/access/`** stores it: tenants, roles and memberships, with the invariants as refusals —
  the last administrator cannot be removed, a granter cannot hand over what they do not hold, a
  deleted role's members go somewhere named.
- **`kernel/access/query.ts`** compiles the rules into the Mongo filter every scoped read spreads,
  so a key that grants more returns more without anybody editing a fragment.
- **`GET /account/abilities`** publishes the packed rules; the frontend evaluates _those_, not a
  copy of them.
- Route guards take a KEY. `users.delete` and `payments.update` carry `stepUp: critical`, and the
  guard demands the fresh session and audits that it did.

**Where the boilerplate stops short, on purpose.** It ships one shop, so no collection carries a
`tenantId` column and `accessibleFilter` drops that condition — the model is tenant-aware and its
conformance cases prove it, while these tables are not partitioned. A multi-tenant deployment adds
the column and empties one list; the rules, the guards and the caller already carry the tenant.

## The twins

The PHP backend answers all of this **identically** — same roles, same scopes, same key grammar,
same wire format — with different tools, because the idiomatic library on each side is different
and forcing one abstraction over both makes both worse.

| Same in both, on purpose                                                               | Allowed to differ                              |
| -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| The vocabulary: `action`, `subject`, `conditions`, `fields`, `manage`, `all`, `Caller` | The library doing the evaluating               |
| The permission keys, and the preset roles seeded on day one                            | How rules become a query                       |
| The scope model: `tenant` \| `platform`, never both, never derived from a flag         | `guard_name`, which only the PHP package needs |
| The wire format of `GET /account/abilities`                                            | Everything else about the implementation       |
| The conformance suite — one fixture file, identical bytes, run by both                 | —                                              |

Here that is `@casl/ability`, whose rules compile straight into a Mongo query and can be shipped to
the browser as the same rules. There it is `spatie/laravel-permission` for the storage half only —
which roles exist and who holds them, in which shop — with the evaluation and the query fragment
hand-written over it, because a package that answers "does this name appear" cannot answer "in this
scope, on rows matching these conditions".

The suite is what keeps them honest, and it holds the **deny** cases rather than the happy path: a
widened scope does not fail a test that only checks the right thing is allowed.
