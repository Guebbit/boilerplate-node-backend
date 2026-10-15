import type { KnipConfig } from 'knip';

/**
 * knip: lists unused files, exports and dependencies by walking imports from the entry points.
 * https://knip.dev/reference/configuration
 *
 * Read by the `code-shape` audit, never by a gate — see `scripts/audit/code-shape/SKILL.md`.
 * This file only states what knip cannot see on its own; everything it then reports is a
 * candidate for the audit to judge, not a verdict.
 */
const config: KnipConfig = {
    // Entry points on top of the ones knip's plugins find from package.json, jest and eslint.
    entry: [
        // The module barrels are public surface, unused on purpose — `CLAUDE.md` § Module barrels.
        'src/modules/*/index.ts',
        // Loaded by directory scan in `scripts/contracts/client-collections-bundle.ts`.
        'src/modules/*/probes.ts',
        // Run inside their containers, never imported.
        'docker/*.{js,mjs}',
        // Run by the load-test tool, never imported.
        'tests/load/*.js',
        // Named by `stryker.json`, which no knip plugin reads.
        'jest.config.mutation.js',
        // Loaded by VitePress from its own conventional paths.
        'docs/.vitepress/config.mts',
        'docs/.vitepress/theme/index.ts'
    ],
    // Dependencies used in a way an import walk cannot see.
    ignoreDependencies: [
        // Spawned by file path in `scripts/contracts/openapi-bundle.ts`, never imported.
        '@redocly/cli',
        // `k6/*` are built into the k6 runtime the load scripts run in, not npm packages.
        'k6',
        // The mutation run's transform, named in `jest.config.mutation.js`, which knip does not
        // read as a jest config; `@swc/core` is its peer.
        '@swc/jest',
        '@swc/core',
        // Loaded by name from `stryker.json` (`testRunner: "jest"`).
        '@stryker-mutator/jest-runner',
        // Provides `spectral:oas` and `spectral:asyncapi` to `shared/contracts/spectral*.yaml`.
        '@stoplight/spectral-rulesets'
    ],
    // System tools a script spawns.
    ignoreBinaries: [
        // `scenarios/tools/generate-webhook-sink-tls.ts` shells out to it.
        'openssl'
    ],
    // Imports that resolve at run time, not from the importing file.
    ignoreUnresolved: [
        // A `tsx --import` argument in `tests/cluster/support/cluster.ts`, resolved from the repo root.
        './scenarios/support/development-doubles.ts'
    ]
};

export default config;
