/**
 * The `no-nullable-keyword` Spectral rule: OpenAPI 3.1 ignores a stray `nullable: true` without
 * a word, so the lint is the only thing that turns that mistake into a failure.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/** `execFile` without blocking the event loop — the CLI takes a second to start. */
const run = promisify(execFile);

/** The scratch folders this file made, removed after each case. */
const scratch: string[] = [];

afterEach(() => Promise.all(scratch.splice(0).map((folder) => rm(folder, { recursive: true }))));

/** The ruleset every module fragment is linted with (it extends the bundle's). */
const RULESET = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'shared',
    'contracts',
    'spectral.modules.yaml'
);

/** The local Spectral binary — the same one `npm run lint:openapi:modules` runs. */
const SPECTRAL = path.join(__dirname, '..', '..', '..', '..', 'node_modules', '.bin', 'spectral');

/**
 * Lint one schema's `properties` and report the `no-nullable-keyword` findings.
 *
 * @param properties - the YAML body of the schema's `properties` map, indented by 8 spaces
 * @returns the JSON paths the rule flagged
 */
const nullableFindings = async (properties: string): Promise<string[]> => {
    const folder = await mkdtemp(path.join(tmpdir(), 'nullable-rule-'));
    scratch.push(folder);
    const file = path.join(folder, 'fragment.yaml');
    await writeFile(
        file,
        `openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths: {}\ncomponents:\n  schemas:\n    A:\n      type: object\n      properties:\n${properties}\n`
    );

    // Spectral CLI: `--format json` prints the findings as an array. It exits non-zero when it
    // reports an error-severity finding, which the rejection still carries on `stdout`: the exit
    // code is not read, because other (unrelated) findings on this scratch document may fail the run.
    const { stdout } = await run(
        SPECTRAL,
        ['lint', '--ruleset', RULESET, '--format', 'json', file],
        {
            encoding: 'utf8'
        }
    ).catch((error: { stdout: string }) => error);
    const findings = JSON.parse(stdout) as { code: string; path: string[] }[];
    return findings
        .filter(({ code }) => code === 'no-nullable-keyword')
        .map(({ path: p }) => p.join('.'));
};

describe('no-nullable-keyword', () => {
    it('refuses `nullable: true` and `nullable: false` alike', async () => {
        const flagged = await nullableFindings(
            '        x: { type: string, nullable: true }\n        y: { type: string, nullable: false }'
        );

        expect(flagged).toEqual([
            'components.schemas.A.properties.x.nullable',
            'components.schemas.A.properties.y.nullable'
        ]);
    });

    it('accepts the 3.1 spellings, and a property that happens to be named nullable', async () => {
        const flagged = await nullableFindings(
            "        x: { type: [string, 'null'] }\n        y: { oneOf: [{ type: string }, { type: 'null' }] }\n        nullable: { type: string, maxLength: 5 }"
        );

        expect(flagged).toEqual([]);
    });
});
