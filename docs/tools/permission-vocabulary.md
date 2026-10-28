# Permission Vocabulary

The action vocabulary (`read`, `create`, `update`, `delete`, `checkout`, ...) is written **once**,
as `actions:` in `shared/authorization-keys.yaml`, and generated into both repos.

## One list, generated twice

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 45, 'rankSpacing': 55}}}%%
flowchart LR
    ROOT["shared/contracts/<br/>authorization-keys.root.yaml<br/><i>you edit this</i>"]
    BUNDLE["regenerate"]
    KEYS["shared/authorization-keys.yaml"]
    GEN["gen:permission-vocabulary<br/>(also run by gen:api)"]
    BE["api/permission-vocabulary.ts<br/><i>gitignored</i>"]
    SYNC["sync:frontend<br/><i>copies the yaml</i>"]
    FEGEN["frontend gen:api<br/>same script"]
    FE["contracts/permission-vocabulary.ts<br/><i>committed</i>"]

    ROOT --> BUNDLE --> KEYS --> GEN --> BE
    KEYS --> SYNC --> FEGEN --> FE
```

| Side     | Reads                                                 | Writes                                          | Committed?            |
| -------- | ----------------------------------------------------- | ----------------------------------------------- | --------------------- |
| Backend  | `shared/authorization-keys.yaml`                      | `api/permission-vocabulary.ts`                  | no, like `api/`       |
| Frontend | `<frontend>/contracts/authorization-keys.yaml` (copy) | `<frontend>/contracts/permission-vocabulary.ts` | yes, like `routes.ts` |

`regenerate` runs `gen:permission-vocabulary` **before** `contracts:bundle`: the bundler loads the kernel,
and the kernel imports this generated file, so on a clean checkout it has to exist first. `gen:api`
runs the same script again because its `rm -rf ./api` removes the file.

## What consumes it

- Backend: `kernel/permissions.ts` re-exports the `PermissionAction` type and hands
  `PERMISSION_ACTIONS` to the Zod schemas that validate every rule in the shared file.
- Frontend: `PermissionAction` in `<frontend>/src/infrastructure/session.ts` is the generated type, so a screen
  can only ask `can()` for an action the backend declares.

## Adding an action

1. Add it to `actions:` in `shared/contracts/authorization-keys.root.yaml`, with the reason CRUD
   cannot say it.
2. Declare a rule that carries it, in the module's `authorization.yaml`, and list it in a set.
3. `npm run regenerate`. Nothing else is typed by hand.

## Guards

- Backend: `tests/cross-cutting/permission-vocabulary.test.ts` (the generated array equals the yaml,
  and every declared rule's action is in it) and
  `tests/unit/scripts/contracts/permission-vocabulary-render.test.ts`.
- Frontend: `npm run check` compares the committed file with a fresh render.
- Pair: the spec-identity check fails when the yaml copy differs from the backend's.

The generator is a shared script, byte-identical in both repos, like `generate-error-codes.ts`.
