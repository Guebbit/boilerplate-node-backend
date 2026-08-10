import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard: user-facing copy must come from a dictionary, not from a string literal in a controller.
 *
 * `rejectResponse(response, status, errors)` and `generateReject(status, errors)` carry the only
 * text a user reads — the envelope's own `message` is derived from the status by
 * `resolveErrorMessage` and cannot be passed. So this checks the `errors` argument of both, and
 * within it only the parts a user reads:
 *
 * - a bare string element (`['since must be a valid ISO-8601 timestamp']`)
 * - the `message:` of an error object
 *
 * Explicitly NOT flagged, because they are technician-facing by convention: `code:` identifiers,
 * log lines, audit actions, OTel span names and attributes, and thrown `Error` messages. See the
 * i18n section of README.md.
 */

const SOURCE_ROOT = path.join(__dirname, '..', '..', '..', 'src');

const listSourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const entryPath = path.join(directory, entry);
        if (statSync(entryPath).isDirectory()) return listSourceFiles(entryPath);
        return entryPath.endsWith('.ts') ? [entryPath] : [];
    });

/**
 * Reads the argument list of a call starting at `openIndex` (the `(`), respecting nesting and
 * string literals, and returns the arguments split at top-level commas.
 */
const readCallArguments = (source: string, openIndex: number): string[] => {
    const argumentTexts: string[] = [];
    let depth = 0;
    let current = '';
    let quote = '';

    for (let index = openIndex; index < source.length; index++) {
        const character = source[index]!;

        if (quote) {
            current += character;
            if (character === quote && source[index - 1] !== '\\') quote = '';
            continue;
        }

        if (character === "'" || character === '"' || character === '`') {
            quote = character;
            current += character;
            continue;
        }

        if ('([{'.includes(character)) {
            depth += 1;
            if (depth === 1) continue;
        } else if (')]}'.includes(character)) {
            depth -= 1;
            if (depth === 0) {
                argumentTexts.push(current);
                return argumentTexts;
            }
        } else if (character === ',' && depth === 1) {
            argumentTexts.push(current);
            current = '';
            continue;
        }

        current += character;
    }

    return argumentTexts;
};

/**
 * Every string literal in `errorsArgument` that a user would read.
 */
const findUserFacingLiterals = (errorsArgument: string): string[] =>
    [
        // `message: 'literal'` inside an error object
        ...errorsArgument.matchAll(/message:\s*(["'`])((?:(?!\1).)*)\1/g),
        // a bare string element of the array, e.g. `[ 'some message' ]` or `, 'some message']`
        ...errorsArgument.matchAll(/[,[]\s*(["'`])((?:(?!\1).)*)\1\s*(?=[,\]])/g)
    ].map((match) => match[2]!);

/**
 * The two envelope builders, and which argument of each is the user-facing `errors` array.
 *
 * `generateReject` is here because services report failure by returning an envelope rather than
 * sending one, so half the API's user-facing copy never passes through `rejectResponse` at all.
 */
const ENVELOPE_CALLS = [
    { name: 'rejectResponse', errorsIndex: 2 },
    { name: 'generateReject', errorsIndex: 1 }
] as const;

describe('errors[] never carries hardcoded user-facing text', () => {
    const offenders: string[] = [];

    for (const filePath of listSourceFiles(SOURCE_ROOT)) {
        const source = readFileSync(filePath, 'utf8');
        const relativePath = path.relative(SOURCE_ROOT, filePath);

        for (const { name, errorsIndex } of ENVELOPE_CALLS)
            for (const match of source.matchAll(new RegExp(String.raw`\b${name}\s*\(`, 'g'))) {
                const openIndex = match.index + match[0].length - 1;
                const errorsArgument = readCallArguments(source, openIndex)[errorsIndex];
                if (!errorsArgument) continue;

                for (const literal of findUserFacingLiterals(errorsArgument))
                    offenders.push(`${relativePath}: ${literal}`);
            }
    }

    it('finds no hardcoded message in any reject envelope', () => {
        expect(offenders).toEqual([]);
    });

    it.each(ENVELOPE_CALLS)(
        'actually parses the $name calls it claims to check',
        ({ name, errorsIndex }) => {
            /*
             * A canary: if the scanner silently stopped matching — a renamed function, a changed
             * argument order — the guard above would pass vacuously. It caught exactly that when
             * `message` was removed from both signatures and `errors` shifted down one position.
             *
             * Scans the whole tree rather than one file, so it does not also break the next time a
             * particular file stops using one of the two.
             */
            const withErrors = listSourceFiles(SOURCE_ROOT).flatMap((filePath) => {
                const source = readFileSync(filePath, 'utf8');
                return [...source.matchAll(new RegExp(String.raw`\b${name}\s*\(`, 'g'))].filter(
                    (match) =>
                        readCallArguments(source, match.index + match[0].length - 1).length >
                        errorsIndex
                );
            });

            expect(withErrors.length).toBeGreaterThan(0);
        }
    );

    it('flags a literal when there is one', () => {
        expect(findUserFacingLiterals("[{ code: 'X', message: 'Something broke' }]")).toContain(
            'Something broke'
        );
        expect(findUserFacingLiterals("['since must be an ISO-8601 timestamp']")).toContain(
            'since must be an ISO-8601 timestamp'
        );
        // `code` is a stable machine-readable identifier and stays English
        expect(findUserFacingLiterals("[{ code: 'INTERNAL_ERROR', message: t('x.y') }]")).toEqual(
            []
        );
    });
});
