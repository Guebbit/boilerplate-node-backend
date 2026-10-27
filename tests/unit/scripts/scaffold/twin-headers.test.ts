/**
 * @module
 * The scaffolder copies `example`, so each generated file must open with the role sentence its
 * twin in `example` carries ("In any module: ..."). When `example`'s wording moves, this fails
 * until the template moves with it, so a new module never starts from a stale explanation.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planModule } from '../../../../scripts/scaffold/plan';
import type { ScaffoldOptions } from '../../../../scripts/scaffold/options';

/** The options of a plain scaffold. */
const OPTIONS: ScaffoldOptions = {
    name: 'field-notes',
    group: 'foundation',
    summary: 'A note.',
    audit: true,
    regenerate: false
};

/** Generated file (relative to its module folder) to the file in `example` that is its twin. */
const TWINS: Readonly<Record<string, string>> = {
    'module.ts': 'module.ts',
    'index.ts': 'index.ts',
    'model.ts': 'model.ts',
    'repository.ts': 'repository.ts',
    'presenter.ts': 'presenter.ts',
    'routes.ts': 'routes.ts',
    'factories.ts': 'factories.ts',
    'audit.ts': 'audit.ts',
    'services/index.ts': 'services/index.ts',
    'services/crud.ts': 'services/crud.ts',
    'services/actions.ts': 'services/actions.ts',
    'domain/index.ts': 'domain/index.ts',
    'domain/rules.ts': 'domain/lifecycle.ts',
    'controllers/get-field-notes.ts': 'controllers/get-examples.ts',
    'controllers/get-field-notes-item.ts': 'controllers/get-example.ts',
    'controllers/post-field-notes.ts': 'controllers/post-example.ts',
    'controllers/update-field-notes.ts': 'controllers/update-example.ts',
    'controllers/delete-field-notes.ts': 'controllers/delete-example.ts'
};

/**
 * The role sentence of a file's header: the text from "In any module:" up to "Here:" or the end
 * of the paragraph, with comment stars, backticks (generated comments avoid them), dash style and
 * line breaks flattened.
 * @param source - the file text
 * @returns the normalised sentence, or undefined when the header has none
 */
const roleOf = (source: string): string | undefined => {
    const header = /\/\*\*[\s\S]*?\*\//.exec(source)?.[0] ?? '';
    const flat = header
        .split('\n')
        .map((line) => line.replace(/^\s*(\/\*\*|\*\/|\*)\s?/, ''))
        .join('\n');
    const paragraph = /In any module:([\s\S]*?)(?:Here:|\n\n|$)/.exec(flat)?.[1];

    return paragraph?.replaceAll('`', '').replaceAll(/[—–]/g, '-').replaceAll(/\s+/g, ' ').trim();
};

/** The plan, keyed by path relative to the module folder. */
const generated = new Map(
    planModule(OPTIONS).files.map((file) => [
        file.path.replace('src/modules/field-notes/', ''),
        file.content
    ])
);

describe('scaffolded headers against their example twin', () => {
    it('pairs every generated runtime file with a twin, or says why not', () => {
        const unpaired = [...generated.keys()].filter(
            (file) =>
                !(file in TWINS) &&
                !/^(tests\/|docs\/|module\.yaml$|openapi\.yaml$|authorization\.yaml$)/.test(file)
        );

        expect(unpaired).toEqual([]);
    });

    it.each(Object.entries(TWINS))('%s opens like %s', (file, twin) => {
        const mine = roleOf(generated.get(file) ?? '');
        const theirs = roleOf(
            readFileSync(path.join(process.cwd(), 'src/modules/example', twin), 'utf8')
        );

        expect(mine).toBeDefined();
        expect(mine).toBe(theirs);
    });
});
