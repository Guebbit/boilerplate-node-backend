/**
 * The `error-responses-have-a-body` Spectral rule: the problem-JSON rule selects `.content`, so an
 * error that declares no body at all escapes it. This rule is what catches that one.
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

/** The bundle's ruleset, which is where the rule lives. */
const RULESET = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'shared',
    'contracts',
    'spectral.yaml'
);

/** The local Spectral binary — the same one `npm run lint:openapi` runs. */
const SPECTRAL = path.join(__dirname, '..', '..', '..', '..', 'node_modules', '.bin', 'spectral');

/**
 * Lint one operation's `responses` and report the `error-responses-have-a-body` findings.
 *
 * @param responses - the YAML body of the operation's `responses` map, indented by 8 spaces
 * @returns the JSON paths the rule flagged
 */
const bodylessFindings = async (responses: string): Promise<string[]> => {
    const folder = await mkdtemp(path.join(tmpdir(), 'body-rule-'));
    scratch.push(folder);
    const file = path.join(folder, 'spec.yaml');
    await writeFile(
        file,
        `openapi: 3.1.0\ninfo: { title: t, version: '1' }\ncomponents:\n  responses:\n    Bare:\n      description: no body\npaths:\n  /x:\n    get:\n      operationId: getX\n      responses:\n${responses}\n`
    );

    /**
     * Spectral CLI: `--format json` prints the findings as an array. It exits non-zero when it
     * reports an error-severity finding, which the rejection still carries on `stdout`: the exit
     * code is not read, because other findings on this scratch document may fail the run.
     */
    const { stdout } = await run(
        SPECTRAL,
        ['lint', '--ruleset', RULESET, '--format', 'json', file],
        { encoding: 'utf8' }
    ).catch((error: { stdout: string }) => error);
    const findings = JSON.parse(stdout) as { code: string; path: string[] }[];
    return findings
        .filter(({ code }) => code === 'error-responses-have-a-body')
        .map(({ path: p }) => p.join('.'));
};

describe('error-responses-have-a-body', () => {
    it('flags an inline error with no content, and a $ref to a contentless component', async () => {
        const flagged = await bodylessFindings(
            "        '500': { description: boom }\n        '404': { $ref: '#/components/responses/Bare' }"
        );

        // Spectral lints the resolved document, so the `$ref`'d one is reported at its component.
        expect(flagged.toSorted()).toEqual([
            'components.responses.Bare',
            'paths./x.get.responses.500'
        ]);
    });

    it('accepts a deliberately empty error marked x-not-problem, and an error with a body', async () => {
        const flagged = await bodylessFindings(
            "        '503': { description: probe, x-not-problem: true }\n        '422': { description: bad, content: { application/problem+json: { schema: { type: object } } } }\n        '200': { description: fine }"
        );

        expect(flagged).toEqual([]);
    });
});
