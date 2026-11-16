/**
 * The top-level docblock rule of `eslint.config.ts` (`jsdoc/require-jsdoc` + its `contexts`),
 * checked LIVE against the real flat config.
 *
 * Spawned as the real `eslint` binary: the rule needs the type-aware parser, which only lints a
 * file the tsconfig includes, so each case writes a probe file under this folder.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '@tests/paths';

/** The eslint binary the probe is run with. */
const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'eslint');

/** Folder the probe file is written to, removed after each case. */
const PROBE_DIR = path.join(REPO_ROOT, 'tests/unit/scripts/eslint/__docblock-probe');

/** The probe file, relative to the repo root as eslint wants it. */
const PROBE_FILE = path.relative(REPO_ROOT, path.join(PROBE_DIR, 'probe.ts'));

/**
 * Lints `source` and returns the lines `jsdoc/require-jsdoc` flags.
 *
 * @param source - the probe file's text
 */
const undocumentedLines = (source: string): Promise<number[]> => {
    // A killed earlier run never reached its cleanup.
    rmSync(PROBE_DIR, { recursive: true, force: true });
    mkdirSync(PROBE_DIR, { recursive: true });
    writeFileSync(path.join(PROBE_DIR, 'probe.ts'), source);

    return new Promise((resolve, reject) => {
        execFile(
            ESLINT_BIN,
            ['--format', 'json', '--no-warn-ignored', PROBE_FILE],
            { cwd: REPO_ROOT, encoding: 'utf8' },
            // A finding exits non-zero, which is the case under test.
            (_error, stdout) => {
                try {
                    // Narrowing: `--format json` prints an array of per-file results.
                    const [result] = JSON.parse(stdout) as {
                        messages: { ruleId: string | null; line: number }[];
                    }[];
                    resolve(
                        result.messages
                            .filter((message) => message.ruleId === 'jsdoc/require-jsdoc')
                            .map((message) => message.line)
                    );
                } catch (parseError) {
                    reject(
                        parseError instanceof Error ? parseError : new Error(String(parseError))
                    );
                }
            }
        );
    });
};

describe('jsdoc/require-jsdoc contexts', () => {
    afterEach(() => rmSync(PROBE_DIR, { recursive: true, force: true }));

    it('flags the members of an `export default class`', async () => {
        const lines = await undocumentedLines(
            [
                '/** The class. */',
                'export default class Probe {',
                '    run() {',
                '        return 1;',
                '    }',
                '    name = 1;',
                '}'
            ].join('\n')
        );

        expect(lines).toEqual([3, 6]);
    });

    it('flags an abstract method and an abstract property, named or default', async () => {
        const lines = await undocumentedLines(
            [
                '/** One. */',
                'export abstract class One {',
                '    abstract go(): void;',
                '    abstract label: string;',
                '}',
                '/** Two. */',
                'export default abstract class Two {',
                '    abstract go(): void;',
                '}'
            ].join('\n')
        );

        expect(lines).toEqual([3, 4, 8]);
    });

    it('exempts a `require` import, with or without an `as` cast, but not a declaration that merely contains one', async () => {
        const lines = await undocumentedLines(
            [
                "const imported = require('node:path');",
                "const cast = require('node:fs') as typeof import('node:fs');",
                "const wrapped = Object.freeze(require('node:os'));",
                'export { imported, cast, wrapped };'
            ].join('\n')
        );

        expect(lines).toEqual([3]);
    });
});
