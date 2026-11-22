#!/usr/bin/env tsx
/**
 * The hand-kept half of `docs/reference/package-dependencies.md`: which family a package belongs to,
 * and why it's there. Everything else on that page — which packages exist, and who imports each
 * one — is derived by `./generate-dependency-map.ts` and would drift the moment it were typed
 * here too.
 *
 * Patterns first (`@opentelemetry/*`, `@types/*`), exact names for the rest. A package matching no
 * group here, and imported by more than one module, lands on the page's "Ungrouped" table instead
 * of failing anything — visible beats silent.
 *
 * A package imported by **exactly one module**, and matching no group below, is left out on
 * purpose: the generator lists it under that module instead, which is the one piece of ownership a
 * hand-kept table would only ever restate.
 */

/** One family of packages: what they're for, and where to read more. */
export interface DependencyGroup {
    /** The group's heading in the generated table. */
    name: string;
    /** What the packages are for, in one line. */
    purpose: string;
    /** A docs page with the reasoning. */
    readMore: string;
    /** Package names, or `prefix*` globs, that belong to the group. */
    match: string[];
}

/** Runtime families — code that runs at request time, in production. */
export const RUNTIME_GROUPS: DependencyGroup[] = [
    {
        name: 'HTTP core',
        purpose:
            'the HTTP runtime, env loading, request validation, uploads, small shared helpers, ' +
            'and running the TS entrypoints directly — `tsx`, in production too',
        readMore: '[Runtime](../understand/runtime.md)',
        match: ['express', 'dotenv', 'zod', 'multer', 'tsx', '@guebbit/js-toolkit']
    },
    {
        name: 'Security and auth',
        purpose:
            'request guardrails, capability-based authorization, password hashing, anti-bot ' +
            'proof-of-work, blocking disposable email domains at signup, TOTP two-factor codes, and the SSRF ' +
            'guard’s resolved-IP range checks',
        readMore: '[Security](../understand/security.md)',
        match: [
            'helmet',
            'cors',
            'express-rate-limit',
            'cookie-parser',
            '@casl/ability',
            '@casl/mongoose',
            'altcha-lib',
            'disposable-email-domains-js',
            'ipaddr.js',
            'otplib'
        ]
    },
    {
        name: 'Persistence',
        purpose:
            'driver + ODM for MongoDB. `mongodb` itself is imported only as a type, to pin the ' +
            'driver version `mongoose` hands back from `.connection.db` where the demo profile ' +
            'snapshots and restores raw documents. `mongodb-connection-string-url` is the ' +
            'parser the driver itself uses, here to merge a password into a Mongo URI',
        readMore: '[MongoDB & Mongoose](../understand/mongodb-mongoose.md)',
        match: ['mongodb', 'mongodb-connection-string-url', 'mongoose']
    },
    {
        name: 'Cache and messaging',
        purpose:
            'cache and pub/sub invalidation, rate-limit storage, and async job publish/consume',
        readMore:
            '[Redis Cache](../understand/redis-cache.md), [RabbitMQ](../understand/rabbitmq.md)',
        match: ['redis', 'rate-limit-redis', 'amqplib']
    },
    {
        name: 'Email, rendering, media',
        purpose:
            'transactional email, templates, PDF rendering, CSV export with formula escaping, ' +
            'and image processing',
        readMore:
            '[Email & PDF Rendering](../understand/email-and-rendering.md), [orders](../modules/orders.md#libraries)',
        match: ['nodemailer', 'ejs', 'puppeteer-core', 'sharp', 'csv-stringify']
    },
    {
        name: 'Observability',
        purpose: 'tracing, metrics, structured logs, and optional product analytics',
        readMore:
            '[OpenTelemetry](../operate/opentelemetry.md), [Tempo](../operate/tempo.md), [Grafana](../operate/grafana.md), ' +
            '[Prometheus](../operate/prometheus.md), [Winston & Audit Logs](../operate/winston.md), ' +
            '[Product Analytics](../understand/analytics.md)',
        match: ['@opentelemetry/*', 'prom-client', 'winston', 'posthog-node']
    },
    {
        name: 'i18n',
        purpose: 'the shared translation runtime every module’s locale files load into',
        readMore: '[i18n](../understand/i18n.md)',
        match: ['i18next']
    },
    {
        name: 'Declared config',
        purpose:
            'parsing the small YAML files read once at boot: the authorization key/role ' +
            'declarations `kernel/permissions.ts` reads, and each module’s published event ' +
            'catalogue',
        readMore: '[Authorization](../understand/authorization.md)',
        match: ['yaml']
    }
];

/** Dev families — build, lint, test, and docs tooling; never shipped. */
export const DEV_GROUPS: DependencyGroup[] = [
    {
        name: 'TypeScript toolchain',
        purpose: 'authoring and reloading TS code in dev',
        readMore: '[Runtime](../understand/runtime.md)',
        match: ['typescript', 'nodemon', 'jiti']
    },
    {
        name: 'Type definitions',
        purpose: 'TS types for runtime packages that ship none of their own',
        readMore: '—',
        match: ['@types/*']
    },
    {
        name: 'Testing',
        purpose: 'unit and integration tests, with an ephemeral MongoDB and a fast TS transpiler',
        readMore: '[Testing & Docs](../build/testing-and-docs.md)',
        match: [
            'jest',
            'jest-environment-node',
            'ts-jest',
            // babel-jest's one plugin: downlevels the ESM-only `@scure`/`@noble` packages to CJS.
            '@babel/plugin-transform-modules-commonjs',
            '@swc/core',
            '@swc/jest',
            'supertest',
            'mongodb-memory-server',
            /**
             * The demo profile's `Date`-only clock (`scenarios/support/demo-clock.ts`); jest's own
             * fake timers depend on the same package.
             */
            '@sinonjs/fake-timers'
        ]
    },
    {
        name: 'Deeper testing',
        purpose:
            'mutation testing, property-based testing, and matching a changed ' +
            "file against `stryker.json`'s own `mutate` globs the same way Stryker itself does",
        readMore: '[Mutation Testing](../build/mutation-testing.md)',
        match: ['@stryker-mutator/*', 'fast-check', 'minimatch']
    },
    {
        name: 'Linting and formatting',
        purpose:
            'lint rules, TS-aware parsing, rule composition, blank-line layout, and formatting',
        readMore: '[Testing & Docs](../build/testing-and-docs.md)',
        match: [
            'eslint',
            'eslint-config-prettier',
            'eslint-import-resolver-typescript',
            'eslint-plugin-jest',
            'eslint-plugin-jsdoc',
            'eslint-plugin-regexp',
            'eslint-plugin-unicorn',
            '@eslint/js',
            '@stylistic/eslint-plugin',
            '@eslint-community/eslint-plugin-eslint-comments',
            '@typescript-eslint/*',
            'typescript-eslint',
            'globals',
            'prettier'
        ]
    },
    {
        name: 'Architecture',
        purpose: 'the module-boundary rules `npm run check` enforces',
        readMore: '[Dependency Graph](../build/dependency-graph.md)',
        match: ['dependency-cruiser', 'eslint-plugin-boundaries']
    },
    {
        name: 'Code-shape audit',
        purpose:
            'the deterministic counters the `code-shape` AI audit judges by: unused files, ' +
            'exports and dependencies, and copy-pasted code. Run by hand, never a gate',
        readMore: '[AI Auditing](../build/ai-auditing.md)',
        match: ['knip', 'jscpd']
    },
    {
        name: 'Commit hygiene',
        purpose: 'commit message linting, git hooks and staged-file fixes',
        readMore: '—',
        match: ['husky', 'lint-staged', '@commitlint/*']
    },
    {
        name: 'Contracts and codegen',
        purpose:
            'OpenAPI/AsyncAPI linting, mocking, and generated client/type workflows. ' +
            '`@guebbit/openapi-runnable-collections` is the typed probe/collection descriptor ' +
            'used only by `scripts/contracts/client-collections-bundle.ts`. `openapi-types` is ' +
            'the OpenAPI 3.1 document type and HTTP method list every bundler step shares ' +
            '(`scripts/contracts/openapi-document.ts`)',
        readMore:
            '[OpenAPI Workflow](../build/openapi-workflow.md), ' +
            '[AsyncAPI Workflow](../build/asyncapi-workflow.md)',
        match: [
            '@asyncapi/*',
            '@stoplight/*',
            '@redocly/cli',
            'orval',
            'openapi-types',
            '@guebbit/openapi-runnable-collections'
        ]
    },
    {
        name: 'Docs site',
        purpose:
            'the docs site, diagrams, and offline search UI; `@mdit-vue/shared` is VitePress’s own ' +
            'heading slugifier, so the anchor checker matches the site',
        readMore: '[Testing & Docs](../build/testing-and-docs.md)',
        match: ['vitepress', 'mermaid', '@mdit-vue/shared']
    },
    {
        name: 'Maintenance',
        purpose:
            'cross-platform env vars in npm scripts; `semver` compares Zammad advisory ranges ' +
            'with the pinned image in `scripts/security/zammad-advisories.ts`',
        readMore: '[Zammad](../operate/zammad.md#security-releases)',
        match: ['cross-env', 'semver']
    }
];

/** True when `packageName` is named by one of `patterns` — an exact name, or a `prefix*` match. */
export const matchesGroup = (packageName: string, patterns: string[]): boolean =>
    patterns.some((pattern) =>
        pattern.endsWith('*')
            ? packageName.startsWith(pattern.slice(0, -1))
            : packageName === pattern
    );
