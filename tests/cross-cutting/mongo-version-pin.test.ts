import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';

/**
 * Guard: the `mongod` the compose stacks run is the `mongod` the tests ran.
 *
 * `package.json` `config.mongodbMemoryServer.version` is what every suite, CI and the Dockerfile's
 * baked test binary use. Dependabot cannot see it, so a compose bump would otherwise land green
 * while production runs a version no test touched. A mongo patch PR stays red until the pin
 * moves in the same PR.
 */

/** The compose files that hold a MongoDB image: the shared base (`database`) and production (`mongo-rs-init`, `restore-drill-db`). */
const COMPOSE_FILES = ['compose.yaml', 'compose.production.yaml'];

/** The shape read out of a compose file: only each service's image matters here. */
interface ComposeFile {
    services: Record<string, { image?: string }>;
}

/**
 * The version tag of every `mongo` image in one compose file (the part between `:` and `@sha256`).
 * @param file - compose file name, relative to the repo root.
 * @returns one tag per mongo service.
 */
const mongoTags = (file: string): string[] => {
    const compose = parse(readFileSync(path.join(REPO_ROOT, file), 'utf8')) as ComposeFile;
    return Object.values(compose.services)
        .map((service) => service.image ?? '')
        .filter((image) => /(?:^|\/)mongo:/.test(image))
        .map((image) => /:([^@]+)@/.exec(image)?.[1] ?? '');
};

/** The tests' pin. */
const pin = (
    JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
        config: { mongodbMemoryServer: { version: string } };
    }
).config.mongodbMemoryServer.version;

describe('compose MongoDB version', () => {
    const tags = COMPOSE_FILES.flatMap((file) => mongoTags(file));

    it('finds at least one mongo image to compare', () => {
        expect(tags.length).toBeGreaterThan(0);
    });

    it.each(COMPOSE_FILES)('%s runs the version the tests run', (file) => {
        for (const tag of mongoTags(file)) {
            expect(tag).toBe(pin);
        }
    });
});
