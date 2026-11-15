---
type: task
audience: [operator]
---

# After the first deploy

Make the first admin, publish a disclosure contact and wire the first integration, on a stack that is already up.

## Before you start

- The stack is up and healthy: [Check it worked](./first-deploy.md#check-it-worked).

## Steps

### 1 · The first admin {#the-first-admin}

`setup` gives the database its shop and its preset roles, but nobody starts with a role above
`customer` — the first signup racing to become admin is a known vulnerability pattern, so nothing
does that automatically. Sign up through the app once, then the technician gives that account its
role by writing the membership into the database by hand. There is no command for it, the first
owner included, and the same hand-written fix is the way back if every admin is ever locked out.

The write, from the stack's own `database` container (the id is the account's `_id`, shown by
`db.users.findOne({ email: "<their email>" })`; the tenant id is the deployment's fixed one):

```bash
docker compose --env-file "clients/<name>/.env" -f docker-compose.production.yml \
  exec database mongosh --tls --tlsCAFile /keyfile-dir/mongo-ca.crt \
  -u "$MONGO_ROOT_USER" -p --authenticationDatabase admin "<MONGO_DB>" --eval '
    db.memberships.updateOne(
      { userId: "<the account id>", tenantId: "65dd20000000000000000001", scope: "tenant" },
      { $set: { role: "admin" }, $currentDate: { updatedAt: true, createdAt: true } },
      { upsert: true }
    )
  '
```

One membership per person per place, so the same command also _changes_ a role. An administrator
that was switched off, or erased, comes back with `db.users.updateOne({ _id: ObjectId("<id>") },
{ $set: { active: true }, $unset: { deletedAt: "" } })`. The app has no way to do either on an
administrator's behalf: only a role manager changes one, and the app has no role manager above an administrator ([Authorization](../understand/authorization.md#protecting-people)).

### 2 · Publish a disclosure contact {#publish-a-disclosure-contact}

Set `NODE_SECURITY_CONTACT`, `NODE_SECURITY_EXPIRES` (and optionally `NODE_SECURITY_POLICY_URL`) so
a researcher who finds a bug in your deployment knows where to send it. Left unset, nothing is
published. See [Reporting a vulnerability](../understand/security.md#reporting-a-vulnerability).

### 3 · The first third-party integration {#the-first-third-party-integration}

The contracts ship at `0.1.0` (alpha: REST may break freely). Before the first partner script uses
an `sk_` API key, or the first outside subscriber receives a webhook, bump `info.version` to
`1.0.0` in `shared/contracts/openapi.root.yaml` and in the AsyncAPI roots and fragments. From then
on a change that breaks a client goes through a deprecation window. See
[Versioning and retiring an endpoint](../build/versioning.md).

## Read next

- [Getting Started — Production](./first-deploy.md)
