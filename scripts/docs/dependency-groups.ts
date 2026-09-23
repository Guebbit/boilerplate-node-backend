#!/usr/bin/env tsx
/**
 * The hand-kept half of `docs/tools/package-dependencies.md`: which family a package belongs to,
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
    name: string;
    purpose: string;
    readMore: string;
    match: string[];
}

/** Runtime families — code that runs at request time, in production. */
export const RUNTIME_GROUPS: DependencyGroup[] = [
    {
        name: 'HTTP core',
        purpose:
            'the HTTP runtime, env loading, request validation, uploads, small shared helpers, ' +
            'and running the TS entrypoints directly — `tsx`, in production too',
        readMore: '[Runtime](./runtime.md)',
        match: ['express', 'dotenv', 'zod', 'multer', 'tsx', '@guebbit/js-toolkit']
    },
    {
        name: 'Security and auth',
        purpose:
            'request guardrails, capability-based authorization, password hashing, anti-bot ' +
            'proof-of-work, blocking disposable email domains at signup, and the SSRF guard’s ' +
            'resolved-IP range checks',
        readMore: '[Security](./security.md)',
        match: [
            'helmet',
            'cors',
            'express-rate-limit',
            'cookie-parser',
            'bcrypt',
            '@casl/ability',
            '@casl/mongoose',
            'altcha-lib',
            'disposable-email-domains-js',
            'ip-address'
        ]
    },
    {
        name: 'Persistence',
        purpose:
            'driver + ODM for MongoDB. `mongodb` itself is imported only as a type, to pin the ' +
            'driver version `mongoose` hands back from `.connection.db` where the demo profile ' +
            'snapshots and restores raw documents',
        readMore: '[MongoDB & Mongoose](./mongodb-mongoose.md)',
        match: ['mongodb', 'mongoose']
    },
    {
        name: 'Cache and messaging',
        purpose:
            'cache and pub/sub invalidation, rate-limit storage, and async job publish/consume',
        readMore: '[Redis Cache](./redis-cache.md), [RabbitMQ](./rabbitmq.md)',
        match: ['redis', 'rate-limit-redis', 'amqplib']
    },
    {
        name: 'Email, rendering, media',
        purpose: 'transactional email, templates, PDF rendering, and image processing',
        readMore: '[Email & PDF Rendering](./email-and-rendering.md)',
        match: ['nodemailer', 'ejs', 'puppeteer-core', 'sharp']
    },
    {
        name: 'Observability',
        purpose: 'tracing, metrics, structured logs, and optional product analytics',
        readMore:
            '[OpenTelemetry](./opentelemetry.md), [Tempo](./tempo.md), [Grafana](./grafana.md), ' +
            '[Prometheus](./prometheus.md), [Winston & Audit Logs](./winston.md), ' +
            '[Product Analytics](./analytics.md)',
        match: ['@opentelemetry/*', 'prom-client', 'winston', 'posthog-node']
    },
    {
        name: 'i18n',
        purpose: 'the shared translation runtime every module’s locale files load into',
        readMore: '[i18n](./i18n.md)',
        match: ['i18next']
    }
];

/** Dev families — build, lint, test, and docs tooling; never shipped. */
export const DEV_GROUPS: DependencyGroup[] = [
    {
        name: 'TypeScript toolchain',
        purpose: 'authoring and reloading TS code in dev',
        readMore: '[Runtime](./runtime.md)',
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
        readMore: '[Testing & Docs](./testing-and-docs.md)',
        match: [
            'jest',
            'jest-environment-node',
            'ts-jest',
            '@swc/core',
            '@swc/jest',
            'supertest',
            'mongodb-memory-server',
            'jest-openapi'
        ]
    },
    {
        name: 'Deeper testing',
        purpose:
            'mutation testing, property-based testing, load testing, and matching a changed ' +
            "file against `stryker.json`'s own `mutate` globs the same way Stryker itself does",
        readMore: '[Mutation Testing](./mutation-testing.md), [Load Testing](./load-testing.md)',
        match: ['@stryker-mutator/*', 'fast-check', 'autocannon', 'minimatch']
    },
    {
        name: 'Linting and formatting',
        purpose: 'lint rules, TS-aware parsing, rule composition, and formatting',
        readMore: '[Testing & Docs](./testing-and-docs.md)',
        match: [
            'eslint',
            'eslint-config-prettier',
            'eslint-import-resolver-typescript',
            'eslint-plugin-jest',
            'eslint-plugin-jsdoc',
            'eslint-plugin-prettier',
            'eslint-plugin-unicorn',
            '@eslint/js',
            '@eslint-community/eslint-plugin-eslint-comments',
            '@typescript-eslint/*',
            'typescript-eslint',
            'globals',
            'prettier'
        ]
    },
    {
        name: 'Architecture',
        purpose: 'the module-boundary rules `check:dependencies` enforces',
        readMore: '[Dependency Graph](./dependency-graph.md)',
        match: ['dependency-cruiser', 'eslint-plugin-boundaries']
    },
    {
        name: 'Commit hygiene',
        purpose: 'commit message linting and git hooks',
        readMore: '—',
        match: ['husky', '@commitlint/*']
    },
    {
        name: 'Contracts and codegen',
        purpose:
            'OpenAPI/AsyncAPI linting, mocking, and generated client/type workflows. ' +
            '`@guebbit/openapi-runnable-collections` is the typed probe/collection descriptor ' +
            'used only by `scripts/contracts/client-collections-bundle.ts`',
        readMore:
            '[OpenAPI Workflow](../api/openapi-workflow.md), ' +
            '[AsyncAPI Workflow](../api/asyncapi-workflow.md)',
        match: [
            '@asyncapi/*',
            '@stoplight/*',
            '@redocly/cli',
            'orval',
            'yaml',
            '@guebbit/openapi-runnable-collections'
        ]
    },
    {
        name: 'Docs site',
        purpose: 'the docs site, diagrams, and offline search UI',
        readMore: '[Testing & Docs](./testing-and-docs.md)',
        match: ['vitepress', 'vitepress-plugin-mermaid', 'mermaid']
    },
    {
        name: 'Maintenance',
        purpose: 'dependency bumps and cross-platform env vars in npm scripts',
        readMore: '—',
        match: ['npm-check-updates', 'cross-env']
    }
];

/** True when `packageName` is named by one of `patterns` — an exact name, or a `prefix*` match. */
export const matchesGroup = (packageName: string, patterns: string[]): boolean =>
    patterns.some((pattern) =>
        pattern.endsWith('*')
            ? packageName.startsWith(pattern.slice(0, -1))
            : packageName === pattern
    );
