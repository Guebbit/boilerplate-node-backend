/**
 * @module
 * The scaffolder's command line, parsed into a typed option set. Pure: `argv` in, options or a
 * refusal out, so the CLI's I/O layer stays a thin shell around it.
 */

import { isValidEntityName, isValidModuleName } from './names';

/** Everything a caller may decide when scaffolding a module. */
export interface ScaffoldOptions {
    /** The folder name, e.g. `field-notes`. */
    name: string;
    /** Explicit record type name, when the naive singular of `name` is wrong. */
    entity?: string;
    /** `foundation` survives `demo:remove`; `shop` is the demo shop's own. */
    group: 'foundation' | 'shop';
    /** One sentence for the docs index. */
    summary: string;
    /** Emit an `audit.ts` and record actions (default), or declare `noAudit` in `module.yaml`. */
    audit: boolean;
    /** Run `regenerate --no-sync` after writing (default). */
    regenerate: boolean;
}

/** The usage text, printed on a refusal. */
export const USAGE = [
    'Usage: npm run scaffold:module -- <name> [options]',
    '',
    '  <name>            folder name: lower-case letters and hyphens, e.g. field-notes',
    '  --entity <Name>   record type name (default: the naive singular of <name>)',
    '  --group <group>   foundation (default) or shop',
    '  --summary <text>  one sentence for the docs index',
    '  --no-audit        emit no audit action; module.yaml declares noAudit instead',
    '  --no-regenerate   write the files and stop before `regenerate --no-sync`'
].join('\n');

/** A refusal: the reason the arguments cannot be turned into options. */
export interface ParseRefusal {
    error: string;
}

/**
 * Read the value that follows a flag.
 * @param argv - the arguments
 * @param index - where the flag sits
 * @returns the value, or undefined when the flag is last or followed by another flag
 */
const valueAfter = (argv: readonly string[], index: number): string | undefined => {
    const value = argv[index + 1] as string | undefined;
    return value === undefined || value.startsWith('--') ? undefined : value;
};

/**
 * Parse the arguments after `scaffold:module --`.
 * @param argv - the raw arguments
 * @returns the options, or the reason they are unusable
 */
export const parseArguments = (argv: readonly string[]): ScaffoldOptions | ParseRefusal => {
    const positional = argv.filter((argument, index) => {
        const previous = argv[index - 1] as string | undefined;
        return (
            !argument.startsWith('--') &&
            !['--entity', '--group', '--summary'].includes(previous ?? '')
        );
    });
    const [name, ...extra] = positional;

    if (positional.length === 0) return { error: 'A module name is required.' };
    if (extra.length > 0) return { error: `Unexpected argument "${extra[0]}".` };
    if (!isValidModuleName(name))
        return {
            error: `"${name}" is not a usable module name: lower-case letters separated by single hyphens (digits are refused: a permission key is letters and dots only).`
        };

    const flag = (flagName: string): string | undefined => {
        const at = argv.indexOf(flagName);
        return at === -1 ? undefined : valueAfter(argv, at);
    };
    const entity = flag('--entity');
    if (entity !== undefined && !isValidEntityName(entity))
        return { error: `"${entity}" is not a PascalCase type name.` };

    const group = flag('--group') ?? 'foundation';
    if (group !== 'foundation' && group !== 'shop')
        return { error: `--group is "foundation" or "shop", not "${group}".` };

    return {
        name,
        ...(entity === undefined ? {} : { entity }),
        group,
        summary: flag('--summary') ?? `TODO: one sentence on what ${name} is for.`,
        audit: !argv.includes('--no-audit'),
        regenerate: !argv.includes('--no-regenerate')
    };
};

/**
 * Whether a parse result is a refusal rather than options.
 * @param result - what {@link parseArguments} returned
 * @returns true for a refusal
 */
export const isRefusal = (result: ScaffoldOptions | ParseRefusal): result is ParseRefusal =>
    'error' in result;
