/**
 * The process is read in exactly one place, and published in exactly one shape.
 *
 * Three payloads describe this process — the SSE frame and the two observability REST endpoints —
 * and each used to read `process.memoryUsage()` and `process.uptime()` for itself. That is not a
 * tidiness problem: the three readings were taken at three instants, two converted to megabytes
 * and one did not, and the roundings differed (`Math.round` against `Math.floor`), so the health
 * endpoint and the live stream reported uptimes a second apart with nothing wrong anywhere.
 *
 * The refactor that removed the three copies cannot, by itself, stop a fourth. This can. Two
 * properties, both of which failed silently before:
 *
 *   1. **One reader.** A new payload that wants uptime reaches for `process.uptime()` because that
 *      is what every other file appeared to do. Nothing failed when it did.
 *   2. **One shape, across two documents.** The bytes block is declared in `openapi.yaml` AND in
 *      `asyncapi.yaml`, because the two documents cannot `$ref` each other. Nothing compared them,
 *      so the REST and SSE views of the same four numbers were free to drift apart field by field.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const REPO_ROOT = path.join(__dirname, '..', '..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'src');

/**
 * Files allowed to read the process directly, and why each one is.
 *
 * A map rather than a list, so the exemption carries its reason at the point that grants it. The
 * gauge is the interesting one: folding it into the shared reader looks like finishing the job and
 * is a bug — its `collect()` runs at scrape time, so it must read when the scrape asks rather than
 * when some payload was composed.
 */
const ALLOWED_READERS: Record<string, string> = {
    'infrastructure/observability/process-snapshot.ts':
        'the shared reader itself — this is where both calls are supposed to live',
    'infrastructure/observability/metrics-http.ts':
        'a prom-client Gauge whose collect() runs at scrape time, so it must read at the instant ' +
        'the scrape asks rather than when a payload is composed'
};

/** Every `.ts` file under `src/`, recursively. */
const listSourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/** Repo-relative and forward-slashed, so the allowlist keys read the same on every platform. */
const relativeToSource = (file: string): string =>
    path.relative(SOURCE_ROOT, file).split(path.sep).join('/');

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const readYaml = (relativePath: string): unknown =>
    parse(readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));

/**
 * Walk a parsed YAML document by key path.
 *
 * Returns `undefined` on a missing step rather than throwing, and every caller asserts the result
 * is defined — so a renamed schema fails as a readable expectation instead of as a TypeError
 * pointing at the middle of a property chain.
 */
const at = (root: unknown, ...keys: string[]): Record<string, unknown> | undefined => {
    let node: unknown = root;
    for (const key of keys) {
        if (!isRecord(node)) return undefined;
        node = node[key];
    }
    return isRecord(node) ? node : undefined;
};

/** Property names of a JSON-Schema-ish object node, in declaration order. */
const propertyNames = (node: Record<string, unknown> | undefined): string[] =>
    Object.keys(isRecord(node?.properties) ? node.properties : {});

describe('the process snapshot', () => {
    const sourceFiles = listSourceFiles(SOURCE_ROOT);

    it('sweeps a source tree that actually has files in it', () => {
        // A canary: an empty sweep would pass every assertion below over nothing at all.
        expect(sourceFiles.length).toBeGreaterThan(100);
    });

    it('is the only place `process.memoryUsage()` and `process.uptime()` are read', () => {
        const offenders = sourceFiles
            .filter((file) => {
                const source = readFileSync(file, 'utf8');
                return (
                    source.includes('process.memoryUsage(') || source.includes('process.uptime(')
                );
            })
            .map((file) => relativeToSource(file))
            .filter((file) => !(file in ALLOWED_READERS));

        expect(offenders).toEqual([]);
    });

    it('keeps every allowlisted reader real, so an exemption cannot outlive its file', () => {
        // An entry for a deleted or renamed file silently widens the rule above.
        const present = new Set(sourceFiles.map((file) => relativeToSource(file)));
        const stale = Object.keys(ALLOWED_READERS).filter((file) => !present.has(file));

        expect(stale).toEqual([]);
    });

    it('publishes the same memory block in openapi.yaml and asyncapi.yaml', () => {
        const rest = at(
            readYaml('src/modules/observability/openapi.yaml'),
            'components',
            'schemas',
            'ProcessMemory'
        );
        const sse = at(
            readYaml('src/modules/observability/asyncapi.yaml'),
            'components',
            'schemas',
            'ObservabilityMetricsPayload',
            'properties',
            'memory'
        );

        expect(rest).toBeDefined();
        expect(sse).toBeDefined();

        // Order included, not just membership: the two are read side by side by anyone comparing
        // the health card to the live feed, and a field order that disagrees is a false lead.
        expect(propertyNames(rest)).toEqual(['rss', 'heapUsed', 'heapTotal', 'external']);
        expect(propertyNames(sse)).toEqual(propertyNames(rest));

        // Both closed, so a field added to one document cannot quietly become legal in the other.
        expect(rest?.additionalProperties).toBe(false);
        expect(sse?.additionalProperties).toBe(false);
    });

    it('types every published uptime as a non-negative integer', () => {
        // The floor/round split that made two endpoints disagree was invisible precisely because
        // every contract already said `integer`. This pins the claim the shared reader relies on.
        const openapi = readYaml('src/modules/observability/openapi.yaml');
        const asyncapi = readYaml('src/modules/observability/asyncapi.yaml');

        const declarations = [
            at(
                openapi,
                'components',
                'schemas',
                'ObservabilityHealth',
                'properties',
                'uptimeSeconds'
            ),
            at(
                openapi,
                'components',
                'schemas',
                'ObservabilityMetricsSummary',
                'properties',
                'process',
                'properties',
                'uptimeSeconds'
            ),
            at(
                asyncapi,
                'components',
                'schemas',
                'ObservabilityMetricsPayload',
                'properties',
                'uptimeSeconds'
            )
        ];

        for (const declaration of declarations) {
            expect(declaration).toBeDefined();
            expect(declaration?.type).toBe('integer');
            expect(declaration?.minimum).toBe(0);
        }
    });
});
