/**
 * The `example` module is the module to copy, so each of its files has to say the same three
 * things in the same shape: what the pattern is in ANY module (`In any module:`), what it does
 * HERE (`Here:`), and where the reasoning lives (`See: docs/…`, last line). A copier reads the
 * header and knows whether to keep, adapt or delete the file. Tests, YAML and JSON are not
 * covered: the header is a `.ts` module's doc comment.
 *
 * The scaffolder's twin check lives beside it: for every core file `scripts/scaffold` emits, its
 * `In any module:` line must be the example's own, so the generated module and the template
 * cannot teach two different things.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MODULES_ROOT } from '@tests/paths';

/** The template module's folder. */
const EXAMPLE_ROOT = path.join(MODULES_ROOT, 'example');

/**
 * Every non-test `.ts` file under a folder, relative to it.
 * @param directory - the folder to walk
 * @param prefix - the path walked so far
 */
const sourceFiles = (directory: string, prefix = ''): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const relative = path.posix.join(prefix, entry.name);
        if (entry.isDirectory())
            return entry.name === 'tests'
                ? []
                : sourceFiles(path.join(directory, entry.name), relative);
        return entry.name.endsWith('.ts') ? [relative] : [];
    });

/**
 * The content lines of a file's `@module` header, comment markers stripped.
 * @param source - the file's text
 */
const headerLines = (source: string): string[] => {
    const match = /\/\*\*\s*\n\s*\*\s*@module\s*\n([\s\S]*?)\*\//.exec(source);
    return (match?.[1] ?? '')
        .split('\n')
        .map((line) => line.replace(/^\s*\* ?/, '').trim())
        .filter((line) => line !== '');
};

describe('every file of the example module carries the template header', () => {
    const files = sourceFiles(EXAMPLE_ROOT);

    it('finds the module’s files', () => {
        expect(files.length).toBeGreaterThan(20);
    });

    it.each(files)('%s opens with `In any module:`, says `Here:`, ends on `See: docs/`', (file) => {
        const lines = headerLines(readFileSync(path.join(EXAMPLE_ROOT, file), 'utf8'));
        const problems = [
            ...((lines[0] ?? '').startsWith('In any module:')
                ? []
                : ['first line is not `In any module:`']),
            ...(/(^|\s)Here:/.test(lines.join('\n')) ? [] : ['no `Here:`']),
            ...((lines.at(-1) ?? '').startsWith('See: docs/')
                ? []
                : ['last line is not `See: docs/…`']),
            // `module.ts` carries the capability table, which is data rather than prose.
            ...(lines.length <= 10 || file === 'module.ts' ? [] : ['header prose is over 10 lines'])
        ];

        expect(problems).toEqual([]);
    });
});
