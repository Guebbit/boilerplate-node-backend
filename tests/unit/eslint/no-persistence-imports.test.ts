/**
 * `eslint/rules/no-persistence-imports` — the rule that keeps the repository the only door.
 *
 * Exercised through ESLint's own `RuleTester`, so what is asserted is exactly what a lint run
 * does: the rule receives a parsed AST, not a string. The cases are split along the rule's two
 * detection routes — the imported NAME (a barrel import, where the specifier is innocent) and
 * the module PATH (`../model`, where the name is innocent) — because a rule that only ever
 * catches one of them looks healthy until the other kind of violation walks past it.
 *
 * The options are exercised too, since the same rule ships configured twice: strict in
 * controllers, `Model`-only everywhere else. A regression there is invisible to a test that
 * only runs the defaults.
 *
 * `tester.run` sits at the top level: RuleTester emits its own describe/it blocks, and jest
 * refuses describes nested inside a test.
 */
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noPersistenceImports } from '../../../eslint/rules/no-persistence-imports';

/*
 * The TypeScript parser, not espree: half of what this rule exists to catch is spelled
 * `import type`, which espree cannot parse at all.
 *
 * Reached through the `typescript-eslint` meta package rather than `@typescript-eslint/parser`
 * directly, because that package publishes no `main` and no `types` — only an `exports` map — and
 * `tsconfig.jest.json` resolves modules as `node16`, under which ts-jest cannot find its
 * declarations (TS2307) even though the runtime require succeeds. `eslint.config.ts` already
 * imports the meta package, so this is the spelling the project has resolving.
 */
const tester = new RuleTester({
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parser: tseslint.parser as never
    }
});

/** The lax configuration: what everything under `src/modules/**` outside persistence gets. */
const MODEL_ONLY = [{ bindings: ['Model'], paths: false }];

/** The strict configuration: what a controller gets. */
const STRICT = [{ bindings: ['Repository', 'Model'], paths: true }];

tester.run('no-persistence-imports', noPersistenceImports as never, {
    valid: [
        {
            // A service holding a repository is the intended design, not a violation.
            code: `import { productRepository } from './repository';`,
            options: MODEL_ONLY
        },
        {
            // `model.ts` itself: the file that IS the schema imports mongoose. Scoped out in the
            // config; asserted here so the suffix match is not mistaken for a repo-wide ban.
            code: `import { Schema, model, type Model } from 'mongoose';`,
            options: [{ bindings: [], paths: false }]
        },
        {
            // A seeder's whole job is bulk-writing fixtures past the domain rules, so `demo.ts`
            // legitimately holds the model. Its exemption is a `files:` glob, not a code shape —
            // with the bindings list emptied, the same import is clean.
            code: `import { productModel } from './model';`,
            options: [{ bindings: [], paths: false }]
        },
        {
            // Names ending in neither suffix are the plain data a repository hands back.
            code: `import type { OrderRecord } from '@modules/orders';`,
            options: STRICT
        },
        {
            // The shared helper every repository is built FROM. `base-repository` ends in the
            // word but is not a collection's door — the path check is anchored on a segment
            // boundary so this stays legal.
            code: `import { createBaseRepository } from '@infrastructure/persistence/base-repository';`,
            options: [{ bindings: [], paths: true }]
        }
    ],
    invalid: [
        {
            // Route one: through the barrel. The specifier says `@modules/users` and nothing
            // else — only the binding name gives the violation away.
            code: `import { userRepository } from '@modules/users';`,
            options: STRICT,
            errors: [{ messageId: 'binding' }]
        },
        {
            // The same import wearing a hat. The IMPORTED name is read, not just the local one,
            // so an alias is not a way out.
            code: `import { userModel as Users } from '@modules/users';`,
            options: MODEL_ONLY,
            errors: [{ messageId: 'binding' }]
        },
        {
            // Route two: through the path. `UserRecord` matches no suffix; the file it comes
            // from is the schema.
            code: `import type { UserRecord } from '../model';`,
            options: STRICT,
            errors: [{ messageId: 'path' }]
        },
        {
            // `import type` is not a loophole. The type IS the schema, so the coupling outlives
            // the erasure — a layer naming it still moves whenever the collection does.
            code: `import type { UserRepositoryContract } from '../repository';`,
            options: STRICT,
            errors: [{ messageId: 'path' }]
        },
        {
            // One mistake, one report: the path verdict covers the declaration, so a persistence
            // name imported from a persistence path is not reported twice on the same line.
            code: `import { orderModel } from './model';`,
            options: STRICT,
            errors: [{ messageId: 'path' }]
        },
        {
            // A namespace import reaches the same file by another spelling.
            code: `import * as schema from '@modules/users/model';`,
            options: STRICT,
            errors: [{ messageId: 'path' }]
        }
    ]
});
