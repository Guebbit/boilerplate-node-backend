import tseslint from 'typescript-eslint';
import globals from 'globals';
import configPrettier from 'eslint-config-prettier';
import pluginUnicorn from 'eslint-plugin-unicorn';
import { globalIgnores } from 'eslint/config';
import pluginOxlint from 'eslint-plugin-oxlint';
import path from 'node:path';

/**
 * Project-local rules.
 *
 * Both of these used to be tests under `tests/cross-cutting/`, and both were the same mistake: a
 * syntactic property of the source, asserted by reading the source as TEXT. One grepped every
 * controller for the string `.catch(`; the other carried a hand-written tokenizer — 60 lines
 * tracking quote state, escape characters and paren depth — to find one argument of one call.
 *
 * A lint rule gets the parsed AST for free, reports at the offending line instead of naming a
 * file, and shows up in the editor while the code is being written rather than in CI afterwards.
 * The tokenizer's failure modes (a paren inside a template literal, a comment containing `.catch(`)
 * simply do not exist here.
 *
 * They live inline rather than in a published plugin package because they are about THIS repo's
 * conventions and have exactly one consumer.
 */
const localRules = {
    /**
     * A promise chain started in a controller must end in `.catch()`.
     *
     * The global handler in `app.ts` answers a client-shaped status for an unhandled rejection,
     * so a missing `.catch()` usually looks right — until it does not: `POST /orders` with a
     * malformed `productId` answered 500 for exactly this reason, an ordinary bad request
     * reported as a server fault. The net also cannot clean up (an upload from a failed write
     * stays orphaned) or record a domain metric (a failed checkout still needs its counter).
     */
    'controller-chain-must-catch': {
        meta: {
            type: 'problem',
            docs: { description: 'Promise chains in controllers must end in .catch()' },
            schema: [],
            messages: {
                missing:
                    'This promise chain has no .catch(). The global error handler is a net, not a ' +
                    'substitute: it cannot clean up after the failure or record the domain metric.'
            }
        },
        create(context: any) {
            /** The method names of a chain, read from its outermost call inwards. */
            const chainMethods = (call: any): string[] => {
                const names: string[] = [];
                let current = call;
                while (
                    current?.type === 'CallExpression' &&
                    current.callee?.type === 'MemberExpression'
                ) {
                    const { property } = current.callee;
                    if (property?.type === 'Identifier') names.push(property.name);
                    current = current.callee.object;
                }
                return names;
            };

            const HANDLER_METHODS = new Set(['then', 'catch', 'finally']);

            /**
             * Is this chain already governed by an outer chain's `.catch()`?
             *
             * A chain written INSIDE a promise handler — the cleanup in
             * `.catch((error) => deleteUpload().then(...))`, or a guard's
             * `return deleteUpload().then(...)` inside a `.then` — rejects into the chain that
             * owns the callback. Reporting it would be asking for a `.catch()` on something that
             * already has one, which is how a rule teaches people to silence it.
             */
            const insidePromiseHandler = (node: any): boolean => {
                let current = node.parent;
                while (current) {
                    const isFunction =
                        current.type === 'ArrowFunctionExpression' ||
                        current.type === 'FunctionExpression';
                    const parent = current.parent;
                    if (
                        isFunction &&
                        parent?.type === 'CallExpression' &&
                        parent.callee?.type === 'MemberExpression' &&
                        parent.callee.property?.type === 'Identifier' &&
                        HANDLER_METHODS.has(parent.callee.property.name)
                    )
                        return true;
                    current = parent;
                }
                return false;
            };

            /**
             * Is the enclosing function the module's exported handler?
             *
             * Only that one owes the chain a `.catch()`, and the reason is who calls it: Express,
             * which does nothing with a returned promise. A private helper that returns its chain
             * is delegating to its caller — `post-reset-request.ts` does exactly this, and the
             * caller's `.catch` is deliberately the one that swallows, to keep the response
             * identical for a known and an unknown email.
             */
            const insideExportedFunction = (node: any): boolean => {
                let outermostFunction;
                let current = node.parent;
                while (current) {
                    if (
                        current.type === 'ArrowFunctionExpression' ||
                        current.type === 'FunctionExpression' ||
                        current.type === 'FunctionDeclaration'
                    )
                        outermostFunction = current;
                    current = current.parent;
                }
                if (!outermostFunction) return false;

                const owner =
                    outermostFunction.parent?.type === 'VariableDeclarator'
                        ? outermostFunction.parent.parent?.parent
                        : outermostFunction.parent;
                return (
                    owner?.type === 'ExportNamedDeclaration' ||
                    owner?.type === 'ExportDefaultDeclaration'
                );
            };

            return {
                CallExpression(node: any) {
                    // Only judge the OUTERMOST call of a chain: an inner `.then` is part of the
                    // same expression and would otherwise be reported a second time.
                    const { parent } = node;
                    if (parent?.type === 'MemberExpression' && parent.object === node) return;

                    const methods = chainMethods(node);
                    if (!methods.includes('then') || methods.includes('catch')) return;
                    if (insidePromiseHandler(node)) return;
                    if (!insideExportedFunction(node)) return;

                    context.report({ node, messageId: 'missing' });
                }
            };
        }
    },

    /**
     * User-facing copy comes from a dictionary, never from a literal at the call site.
     *
     * `rejectResponse(response, status, errors)` and `generateReject(status, errors)` carry the
     * only text a user reads — the envelope's own `message` is derived from the status by
     * `resolveErrorMessage` and cannot be passed. So this checks the `errors` argument, and
     * within it only the parts a user reads: a bare string element, or the `message:` of an error
     * object. `code:` identifiers, log lines, audit actions, span names and thrown `Error`
     * messages are technician-facing by convention and are not flagged.
     */
    'no-hardcoded-user-text': {
        meta: {
            type: 'problem',
            docs: { description: 'User-facing error text must come from i18n, not a literal' },
            schema: [],
            messages: {
                literal:
                    'User-facing text must come from a dictionary: use t(…) instead of a literal ' +
                    'in the errors argument of {{callee}}().'
            }
        },
        create(context: any) {
            const CARRIERS = new Set(['rejectResponse', 'generateReject']);

            /** A string literal, or a template with no expressions — both are hardcoded copy. */
            const isLiteralText = (node: any): boolean =>
                (node?.type === 'Literal' && typeof node.value === 'string') ||
                (node?.type === 'TemplateLiteral' && node.expressions.length === 0);

            return {
                CallExpression(node: any) {
                    const callee =
                        node.callee?.type === 'Identifier' ? node.callee.name : undefined;
                    if (!callee || !CARRIERS.has(callee)) return;

                    const errors = node.arguments.find(
                        (argument: any) => argument?.type === 'ArrayExpression'
                    );
                    if (!errors) return;

                    for (const element of errors.elements) {
                        if (isLiteralText(element)) {
                            context.report({
                                node: element,
                                messageId: 'literal',
                                data: { callee }
                            });
                            continue;
                        }
                        if (element?.type !== 'ObjectExpression') continue;
                        for (const property of element.properties) {
                            const key = property?.key;
                            const isMessage =
                                (key?.type === 'Identifier' && key.name === 'message') ||
                                (key?.type === 'Literal' && key.value === 'message');
                            if (isMessage && isLiteralText(property.value))
                                context.report({
                                    node: property.value,
                                    messageId: 'literal',
                                    data: { callee }
                                });
                        }
                    }
                }
            };
        }
    }
};

export default tseslint.config(
    {
        files: ['**/*.{ts,mts,tsx}']
    },

    /**
     * Excluded files
     */
    globalIgnores([
        '**/dist/**',
        '**/dist-ssr/**',
        '**/coverage/**',
        '**/docs/**',
        '**/node_modules/**',
        /*
         * Stryker copies the whole project here per run. Without this, `npm run lint` fails with
         * one parser error per generated file the moment a mutation run is in flight — or forever,
         * if a crashed run left the directory behind — because the copies sit outside the
         * `tsconfig` project `parserOptions.project` resolves against. `jest.config.js` ignores
         * the same path for the same reason; see the note in `stryker.config.json`.
         */
        '.stryker-tmp/**',
        // Per-run in-memory Mongo data directories — see tests/support/global-setup.ts
        '.tmp/**',
        '**/eslint.config.ts',
        '**/orval.config.ts',
        '**/migrate-mongo-config.ts',
        '**/migrate-mongo-config.js',
        /*
         * Jest's own config, alongside the other tool configs above. It is plain CommonJS and
         * therefore outside the `tsconfig` project `parserOptions.project` resolves against, so
         * linting it is a parser error rather than a finding. (It is a `.js` and not the `.json`
         * it used to be because the per-file coverage thresholds inside it need an explanation
         * attached, and JSON cannot carry a comment.)
         */
        '**/jest.config.js',
        // Same reasoning, for the swc-transform override the mutation run uses.
        '**/jest.config.mutation.js',
        '**/commitlint.config.cjs',
        'db/migrations/**/*.js',
        'docs/**',
        'api',
        // Generated by `npm run gen:asyncapi`, same as `api` above — do not lint generated output
        'src/types/asyncapi.ts',
        '.prism',
        '.dev',
        'scripts/**',
        /*
         * Contract fragments: verbatim slices of a committed document, held at the indentation
         * they have inside it. Half of them are not valid TypeScript on their own — a run of
         * object entries, a group of declarations that reads its credentials from the header
         * fragment — so linting one is a parser error rather than a finding. The BUNDLE they
         * build is linted like any other source file.
         */
        '**/*.fragment.ts'
    ]),

    /**
     * Base eslint
     */
    ...tseslint.configs['recommended'],
    ...pluginOxlint.configs['flat/recommended'],

    /**
     * Unicorn plugin
     */
    pluginUnicorn.configs['flat/recommended'],

    /**
     * All global rules
     */
    {
        languageOptions: {
            parserOptions: {
                project: path.resolve('./tsconfig.json')
            },
            globals: {
                ...globals.browser
            },
            ecmaVersion: 'latest',
            sourceType: 'module'
        },

        plugins: {
            local: { rules: localRules }
        },

        rules: {
            'no-console': 'warn',
            'no-debugger': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'off',
            // '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
            'no-nested-ternary': 'off',
            'unicorn/no-nested-ternary': 'off',
            'unicorn/prefer-top-level-await': 'off',

            /*
             * Three unicorn rules turned off rather than exempted seventeen times.
             *
             * Each was being disabled inline wherever it fired, which is the signal that the rule
             * disagrees with the stack rather than with the code:
             *
             *   no-null            — Mongo and Express both use `null` with meaning. `deletedAt:
             *                        null` is not `undefined`, and `res.json(null)` is a body.
             *   no-useless-undefined — an explicit `return undefined` is this codebase's stated
             *                        convention for "looked, found nothing" (see the union-return
             *                        note in `infrastructure/http/response.ts`).
             *   no-process-exit    — this is a server with a shutdown path; `server-lifecycle.ts`
             *                        exits deliberately, four times, after draining.
             *
             * A rule that needs six exemptions is not catching bugs, it is collecting signatures.
             */
            'unicorn/no-null': 'off',
            'unicorn/no-useless-undefined': 'off',
            'unicorn/no-process-exit': 'off',

            '@typescript-eslint/restrict-plus-operands': [
                'error',
                {
                    allowNumberAndString: true
                }
            ],

            '@typescript-eslint/naming-convention': [
                'error',
                /*
                 * `allowSingleOrDouble`, not `allow`. A single leading underscore was permitted
                 * and a double one was not, which is the entire reason this rule was being
                 * disabled inline nineteen times: `__esModule` (the flag every `jest.mock`
                 * factory must set) and `__v` (Mongo's version key) are both fixed spellings
                 * owned by other ecosystems, not names this codebase gets to choose.
                 */
                {
                    selector: 'default',
                    format: ['camelCase', 'PascalCase'],
                    leadingUnderscore: 'allowSingleOrDouble',
                    trailingUnderscore: 'allow'
                },
                // Allow any format for identifiers that require quotes (e.g. dotted AsyncAPI channel names)
                {
                    selector: ['objectLiteralProperty', 'typeProperty'],
                    modifiers: ['requiresQuotes'],
                    format: null
                },
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE'],
                    leadingUnderscore: 'allowSingleOrDouble',
                    trailingUnderscore: 'allow'
                },
                {
                    selector: ['class', 'typeLike', 'typeParameter', 'enum'],
                    format: ['PascalCase']
                },
                {
                    selector: ['function'],
                    format: ['camelCase'],
                    leadingUnderscore: 'allow'
                },
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    custom: {
                        regex: '^I[A-Z]',
                        match: true
                    }
                },
                {
                    selector: 'enum',
                    format: ['PascalCase'],
                    custom: {
                        regex: '^E[A-Z]',
                        match: true
                    }
                },
                /*
                 * `snake_case` is in the list because wire formats decide these names, not this
                 * codebase: audit entries (`actor_user_id`, `target_type`), analytics properties
                 * (`order_id`) and header-shaped keys are all read by something outside the repo.
                 */
                {
                    selector: ['memberLike', 'enumMember'],
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'],
                    leadingUnderscore: 'allowSingleOrDouble',
                    trailingUnderscore: 'allow'
                }
            ],

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/consistent-destructuring.md
            'unicorn/better-regex': 'warn',

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/better-regex.md
            'unicorn/consistent-destructuring': 'warn',

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/filename-case.md
            // Every file is camelCase
            'unicorn/filename-case': [
                'error',
                {
                    case: 'kebabCase'
                }
            ],

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/catch-error-name.md
            'unicorn/catch-error-name': [
                'error',
                {
                    name: 'error'
                }
            ],

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prevent-abbreviations.md
            'unicorn/prevent-abbreviations': [
                'error',
                {
                    replacements: {
                        i: false,
                        e: false,
                        len: false,
                        prop: false,
                        props: false,
                        prev: false,
                        opts: {
                            options: true
                        },
                        ref: {
                            reference: false
                        }
                    }
                }
            ]

            // https://github.com/sindresorhus/eslint-plugin-unicorn/blob/HEAD/docs/rules/string-content.md
            // 'unicorn/string-content': [
            //   'error',
            //   {
            //     patterns: {
            //       unicorn: '🦄',
            //       awesome: {
            //         suggest: '😎',
            //         message: 'Please use `😎` instead of `awesome`.',
            //       },
            //       cool: {
            //         suggest: '😎',
            //         fix: false,
            //       },
            //     },
            //   },
            // ],
        }
    },
    /**
     * A migration talks to the DRIVER, never to this application.
     *
     * `migrate-mongo` replays these files against databases of every age, including ones written
     * before the model they would import existed. A migration that reaches a mongoose model runs
     * today's schema — hooks, defaults, validators and all — against yesterday's documents, which
     * is how a migration stops being replayable.
     *
     * The list names only aliases and paths that exist. It used to carry `@services/*`,
     * `@repositories/*` and their relative spellings as well; those directories are gone and
     * their aliases no longer resolve, so banning them guarded nothing while implying it did.
     */
    {
        files: ['db/migrations/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        '@app/*',
                        '@infrastructure/*',
                        '@modules/*',
                        '@kernel/*',
                        '../../src/app',
                        '../../src/app/*',
                        '../../src/cluster',
                        '../../src/infrastructure/*',
                        '../../src/modules',
                        '../../src/modules/*',
                        '../../src/kernel/*'
                    ]
                }
            ]
        }
    },

    /**
     * The two project-local rules, replacing the source-scanning tests that used to live in
     * `tests/cross-cutting/`. See their definitions at the top of this file.
     *
     * Scoped to `src/`, deliberately: a test asserting what the reject envelope does with a
     * string is not shipping user-facing copy, and `tests/unit/infrastructure/http/response.test.ts` passes
     * a dozen literals for exactly that reason.
     */
    {
        files: ['src/**/*.ts'],
        rules: {
            'local/no-hardcoded-user-text': 'error'
        }
    },

    /**
     * Controllers, and the one rule that is only theirs.
     *
     * A fire-and-forget promise chain is legitimate in an adapter — `enqueueEmail` deliberately
     * does not block a response on SMTP — and is not legitimate in a request handler, which owes
     * the caller an answer and owes the system its cleanup. So the rule is scoped here rather
     * than run repo-wide, which is exactly the distinction the old source-scanning test drew by
     * only ever looking inside `controllers/` directories.
     */
    {
        files: ['src/modules/*/controllers/**/*.ts'],
        rules: {
            'local/controller-chain-must-catch': 'error'
        }
    },

    /**
     * `src/infrastructure/**` is the technical substrate: bootstrap, adapters,
     * observability and HTTP plumbing. It is the bottom of the dependency
     * graph and must never reach up into application code — that inversion is
     * what turned the old `src/utils/` into a dumping ground.
     *
     * `@modules/*` and `@kernel/*` are in the list because infrastructure sits below both. Without them
     * the rule was silently incomplete: `src/infrastructure/http/errors.ts` could import a domain service
     * and lint stayed quiet, while `docs/theory/layers.md` claimed the tier was enforced.
     */
    {
        files: ['src/infrastructure/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: ['@kernel/*', '@modules/*', '@app/*']
                }
            ]
        }
    },

    /**
     * A module's own specs, co-located under `src/modules/<name>/tests/`.
     *
     * Exempt from the boundary rule above, deliberately. That rule protects the RUNTIME import
     * graph — it is what makes "delete the folder, delete the domain" true. A spec is deleted with
     * the module it belongs to, so it cannot leave coupling behind that outlives either one, and
     * it legitimately needs two things production code must not have: its own module's internals
     * (a unit test of `service.ts` tests `service.ts`, not the barrel's view of it) and other
     * modules' `module.ts` manifests, because asserting cross-module cleanup means running the
     * real registry.
     *
     * Switched off here does NOT mean unenforced. The rule a spec must follow is relational —
     * what it may import depends on which module owns it — and `no-restricted-imports` only
     * matches file globs, so stating it here would take one near-identical block per module, with
     * a new one silently missing the day someone adds a domain. It is asserted instead by
     * `tests/cross-cutting/module-test-boundaries.test.ts`, which knows the owner of each spec and
     * allows exactly four things: its own module, a sibling's barrel, a sibling's manifest, and a
     * sibling's test helpers.
     */
    {
        files: ['src/modules/*/tests/**/*.ts'],
        rules: {
            'no-restricted-imports': 'off'
        }
    },

    /**
     * `src/kernel/**` IS the module system — the registry, the bus between modules, and the auth
     * port that keeps the shared guard out of a `users → account → users` cycle. It knows that
     * modules exist but never which ones. It may reach `infrastructure`; a single import of `@modules/<name>`
     * would make the mechanism depend on one of the things it is meant to carry, and "delete a
     * domain, delete a folder" would stop being true.
     *
     * The test for what belongs here: would this file still make sense in an app with no modules
     * at all? If yes it is `infrastructure`, however domain-free it looks — which is why the request
     * pipeline lives in `infrastructure/http/middlewares` and the queue consumers in `infrastructure/adapters`.
     */
    {
        files: ['src/kernel/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: ['@modules/*', '@app/*']
                }
            ]
        }
    },

    /**
     * Module boundaries.
     *
     * A module owns everything about its domain and exposes one surface: `index.ts`. A sibling may
     * import `@modules/<name>`; reaching `@modules/<name>/service` or any other internal is what
     * this rule exists to stop, because the moment one happens the module stops being deletable.
     *
     * The pattern matches two segments or more, so the barrel itself (`@modules/products`) stays
     * legal while everything below it does not. A module reaches its own files relatively —
     * `./service`, `./controllers/get-products` — which no pattern here touches.
     *
     * `src/modules.ts` sits outside `src/modules/` and so is not covered: the registry is the one
     * caller allowed to import `@modules/<name>/module`, which is the manifest's whole purpose.
     *
     * The layer aliases (`@services/*`, `@controllers/*`, …) used to be banned here as well. They
     * were removed from `tsconfig.json` when the directories went, so an import naming one is
     * already an unresolved module — a TypeScript error before it is a lint one, and a rule that
     * cannot fire is a rule nobody can trust.
     */
    {
        files: ['src/modules/**/*.ts'],
        // Co-located specs are exempt — see the block after this one.
        ignores: ['src/modules/*/tests/**'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@modules/*/*'],
                            message:
                                'Import a sibling module through its public barrel (@modules/<name>), never its internals.'
                        },
                        {
                            group: ['@app/*'],
                            message:
                                'A module may not reach the app tier. `app` assembles the application and is allowed to know every domain; reaching back would point the arrow both ways. A guard every module needs belongs in @kernel behind a port — see kernel/authentication.ts.'
                        }
                    ]
                }
            ]
        }
    },

    /**
     * The domain layer: `src/modules/<name>/domain/**` — pure business rules.
     *
     * The only rule here about what a file may TOUCH rather than which tier it may reach. Plain
     * TypeScript over plain data: no framework, no tier, no sibling, and no `../` — the arrow
     * points inward only, so domain cannot read `../model` or `../repository`.
     *
     * The folder is optional; most modules have none.
     * See `docs/theory/domain-layer.md`.
     */
    {
        files: ['src/modules/*/domain/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'mongoose',
                            message:
                                'The domain layer may not know how anything is stored. Take the data as a plain argument and let the repository do the reading.'
                        },
                        {
                            name: 'express',
                            message:
                                'The domain layer may not know it is being called over HTTP. Return a verdict; the controller turns it into a status code.'
                        }
                    ],
                    patterns: [
                        {
                            group: [
                                '@infrastructure/*',
                                '@kernel/*',
                                '@app/*',
                                '@modules/*',
                                '../*',
                                '../../*'
                            ],
                            message:
                                'The domain layer imports nothing but plain TypeScript — no tier, no sibling module, and none of the outer files of its own module. If a rule needs i18n it is returning a message where it should return a verdict; if it needs a repository it is doing the job of the service layer.'
                        }
                    ]
                }
            ]
        }
    },

    /**
     * "Special" files names are better to be left untouched
     */
    {
        files: ['tests/**/*', '**/*.spec.ts', '**/*.test.ts', '**/*.d.ts'],
        rules: {
            'unicorn/filename-case': 'off',
            'unicorn/prevent-abbreviations': 'off'
        }
    },
    {
        files: ['**/*.d.ts'],
        rules: {
            '@typescript-eslint/naming-convention': 'off'
        }
    },

    /**
     *
     */
    {
        files: ['tests/**/*'],

        languageOptions: {
            globals: {
                ...globals.jest
            }
        }
    },

    /**
     * Disable conflicts with prettier
     */
    configPrettier
);
