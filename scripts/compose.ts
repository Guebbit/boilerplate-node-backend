#!/usr/bin/env tsx
/**
 * One compose invocation for both container runtimes — `npm run compose -- <subcommand>`.
 *
 * This used to be eight package.json scripts: `podman:{restart,rebuild,kill,compose}` and the same
 * four for docker, identical but for the engine name and the override file. The pair that matters
 * is not the engine — it is the `-f` list. Every command MUST pass this runtime's Promtail
 * override, because that is what gives Promtail a host log path to tail. A bare `podman compose up`
 * runs the base file only, its Promtail tails nothing, Loki stays empty and Grafana's log panels
 * stay blank — with no error anywhere. `COMPOSE_FILE` in `.env` does not fix it: podman-compose
 * ignores it there.
 *
 * So the `-f` list lives in exactly one place, and choosing an engine cannot lose it.
 *
 * ## Choosing the engine
 *
 * In order: `CONTAINER_ENGINE` in the environment, then `CONTAINER_ENGINE` in `.env`, then
 * whichever of the two is actually installed, then docker. Zero configuration is the point — a
 * fresh clone on a podman-only machine runs `npm run compose:restart` and gets podman.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');

const ENGINES = ['docker', 'podman'] as const;
type Engine = (typeof ENGINES)[number];

const isEngine = (value: string | undefined): value is Engine => ENGINES.includes(value as Engine);

/** `CONTAINER_ENGINE=podman` in `.env`, read without pulling in the app's config loader. */
const engineFromEnvironmentFile = (): string | undefined => {
    const file = path.join(REPO_ROOT, '.env');
    if (!existsSync(file)) return undefined;
    return readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => /^\s*CONTAINER_ENGINE\s*=\s*(.+?)\s*$/.exec(line)?.[1])
        .findLast((value): value is string => value !== undefined)
        ?.replaceAll(/^["']|["']$/g, '');
};

/** Whether the binary answers at all — `--version` is the cheapest question both engines accept. */
const installed = (engine: Engine): boolean =>
    spawnSync(engine, ['--version'], { stdio: 'ignore' }).status === 0;

const resolveEngine = (): Engine => {
    const requested = process.env.CONTAINER_ENGINE ?? engineFromEnvironmentFile();

    if (requested !== undefined && !isEngine(requested)) {
        console.error(
            `[compose] CONTAINER_ENGINE is "${requested}" — expected one of: ${ENGINES.join(', ')}`
        );
        process.exit(2);
    }
    if (requested !== undefined) return requested;

    // Nothing asked for one: prefer whichever is present, and docker when both or neither are.
    return !installed('docker') && installed('podman') ? 'podman' : 'docker';
};

const engine = resolveEngine();
const commandArguments = process.argv.slice(2);

if (commandArguments.length === 0) {
    console.error(
        `[compose] no subcommand given. Examples:\n` +
            `  npm run compose -- logs -f app\n` +
            `  npm run compose -- ps\n` +
            `  npm run compose:restart`
    );
    process.exit(2);
}

const files = ['docker-compose.yml', `docker-compose.${engine}.yml`];
const argv = [...files.flatMap((file) => ['-f', file]), ...commandArguments];

console.info(`[compose] ${engine} compose ${argv.join(' ')}`);

const { status, error } = spawnSync(engine, ['compose', ...argv], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
});

if (error) {
    console.error(
        `[compose] could not run "${engine}": ${error.message}\n` +
            `  Install it, or pick the other one with CONTAINER_ENGINE=${engine === 'docker' ? 'podman' : 'docker'}.`
    );
    process.exit(1);
}

process.exit(status ?? 1);
