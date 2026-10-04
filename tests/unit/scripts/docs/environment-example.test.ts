import {
    lingeringInExample,
    missingFromExample,
    parseEnvironmentExample
} from '../../../../scripts/docs/environment-example';

/** A small file in the real one's shapes: active, commented, prose that looks like one, a repeat. */
const FILE = [
    '# Header prose, with NODE_FAKE=1 inside it and # NODE_SPACED=2 behind a space',
    'NODE_PORT=3000',
    '',
    '#NODE_HOST=',
    '# NODE_COMMENT_WITH_SPACE=ignored',
    'NODE_PORT=4000',
    'lowercase_var=1'
].join('\n');

describe('parseEnvironmentExample', () => {
    it('reads active and commented-out variables, once each, with their first line', () => {
        expect(parseEnvironmentExample(FILE)).toEqual([
            { name: 'NODE_PORT', line: 2 },
            { name: 'NODE_HOST', line: 4 },
            { name: 'lowercase_var', line: 7 }
        ]);
    });

    it('does not take prose for a variable', () => {
        const names = parseEnvironmentExample(FILE).map(({ name }) => name);

        expect(names).not.toContain('NODE_FAKE');
        expect(names).not.toContain('NODE_SPACED');
        expect(names).not.toContain('NODE_COMMENT_WITH_SPACE');
    });
});

describe('missingFromExample', () => {
    const entries = parseEnvironmentExample(FILE);

    it('names a declared variable the file does not show', () => {
        expect(
            missingFromExample(entries, [{ name: 'NODE_PORT' }, { name: 'NODE_NEW_THING' }])
        ).toEqual(['NODE_NEW_THING']);
    });

    it('counts a commented-out line as shown', () => {
        expect(missingFromExample(entries, [{ name: 'NODE_HOST' }])).toEqual([]);
    });

    it('does not owe a line to a variable something else sets', () => {
        expect(
            missingFromExample(entries, [{ name: 'npm_package_version', setBy: 'npm' }])
        ).toEqual([]);
    });
});

describe('lingeringInExample', () => {
    const entries = parseEnvironmentExample(FILE);

    it('lets a secret vouch for its `_FILE` form, and only a secret', () => {
        const withFiles = parseEnvironmentExample('NODE_KEY_FILE=\nNODE_PORT_FILE=\n');

        expect(
            lingeringInExample(
                withFiles,
                [{ name: 'NODE_KEY', fileForm: 'NODE_KEY_FILE' }, { name: 'NODE_PORT' }],
                new Set()
            )
        ).toEqual([{ name: 'NODE_PORT_FILE', line: 2 }]);
    });

    it('names a variable no slice declares and nothing reads', () => {
        expect(
            lingeringInExample(entries, [{ name: 'NODE_PORT' }], new Set(['NODE_HOST']))
        ).toEqual([{ name: 'lowercase_var', line: 7 }]);
    });

    it('lets a slice or an outside reader vouch for a variable', () => {
        expect(
            lingeringInExample(
                entries,
                [{ name: 'NODE_PORT' }, { name: 'NODE_HOST' }],
                new Set(['lowercase_var'])
            )
        ).toEqual([]);
    });
});
