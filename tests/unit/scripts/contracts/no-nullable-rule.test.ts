/**
 * The `no-nullable-keyword` Spectral rule: OpenAPI 3.1 ignores a stray `nullable: true` without
 * a word, so the lint is the only thing that turns that mistake into a failure.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
const nullableFindings = (properties: string): string[] => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'nullable-rule-')), 'fragment.yaml');
    writeFileSync(
        file,
        `openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths: {}\ncomponents:\n  schemas:\n    A:\n      type: object\n      properties:\n${properties}\n`
    );

    // Spectral CLI: `--format json` prints the findings as an array; the exit code is not read
    // because other (unrelated) findings on this scratch document may fail the run.
    const { stdout } = spawnSync(
        SPECTRAL,
        ['lint', '--ruleset', RULESET, '--format', 'json', file],
        {
            encoding: 'utf8'
        }
    );
    const findings = JSON.parse(stdout) as { code: string; path: string[] }[];
    return findings
        .filter(({ code }) => code === 'no-nullable-keyword')
        .map(({ path: p }) => p.join('.'));
};

describe('no-nullable-keyword', () => {
    it('refuses `nullable: true` and `nullable: false` alike', () => {
        const flagged = nullableFindings(
            '        x: { type: string, nullable: true }\n        y: { type: string, nullable: false }'
        );

        expect(flagged).toEqual([
            'components.schemas.A.properties.x.nullable',
            'components.schemas.A.properties.y.nullable'
        ]);
    });

    it('accepts the 3.1 spellings, and a property that happens to be named nullable', () => {
        const flagged = nullableFindings(
            "        x: { type: [string, 'null'] }\n        y: { oneOf: [{ type: string }, { type: 'null' }] }\n        nullable: { type: string, maxLength: 5 }"
        );

        expect(flagged).toEqual([]);
    });
});
