/**
 * @module
 * What a scaffold writes: the file list, the audit switch, and the generated text that other
 * checks read (the YAML the descriptor schema parses, the contract fragment, the permission keys).
 */

import { parse as parseYaml } from 'yaml';
import { moduleDescriptorSchema } from '../../../../scripts/docs/module-descriptor';
import { collidingSchemas, planModule } from '../../../../scripts/scaffold/plan';
import type { ScaffoldOptions } from '../../../../scripts/scaffold/options';

/** The options of a plain scaffold. */
const OPTIONS: ScaffoldOptions = {
    name: 'field-notes',
    group: 'foundation',
    summary: "It's a note.",
    audit: true,
    regenerate: false
};

/**
 * One planned file's content.
 * @param options - the scaffold options
 * @param file - path relative to the module folder, or a repo path
 * @returns the content
 */
const contentOf = (options: ScaffoldOptions, file: string): string => {
    const found = planModule(options).files.find(
        (candidate) =>
            candidate.path === file || candidate.path === `src/modules/${options.name}/${file}`
    );
    if (!found) throw new Error(`not planned: ${file}`);
    return found.content;
};

describe('planModule', () => {
    it('plans the module folder, its tests and its docs page', () => {
        expect(planModule(OPTIONS).files.map((file) => file.path)).toEqual([
            'src/modules/field-notes/module.yaml',
            'src/modules/field-notes/module.ts',
            'src/modules/field-notes/index.ts',
            'src/modules/field-notes/model.ts',
            'src/modules/field-notes/repository.ts',
            'src/modules/field-notes/service.ts',
            'src/modules/field-notes/presenter.ts',
            'src/modules/field-notes/routes.ts',
            'src/modules/field-notes/factories.ts',
            'src/modules/field-notes/controllers/get-field-notes.ts',
            'src/modules/field-notes/controllers/post-field-notes.ts',
            'src/modules/field-notes/controllers/update-field-notes.ts',
            'src/modules/field-notes/controllers/delete-field-notes.ts',
            'src/modules/field-notes/openapi.yaml',
            'src/modules/field-notes/authorization.yaml',
            'src/modules/field-notes/audit.ts',
            'src/modules/field-notes/tests/unit/routes.test.ts',
            'src/modules/field-notes/tests/unit/factories.test.ts',
            'src/modules/field-notes/tests/integration/service.test.ts',
            'docs/modules/field-notes.md'
        ]);
    });

    it('writes only inside the module folder and the docs page', () => {
        for (const file of planModule(OPTIONS).files)
            expect(file.path).toMatch(
                /^(src\/modules\/field-notes\/|docs\/modules\/field-notes\.md$)/
            );
    });

    it('drops audit.ts and every audit call for --no-audit, and declares noAudit instead', () => {
        const quiet = { ...OPTIONS, audit: false };
        const files = planModule(quiet).files.map((file) => file.path);

        expect(files).not.toContain('src/modules/field-notes/audit.ts');
        expect(contentOf(quiet, 'service.ts')).not.toMatch(
            /recordAudit|CallerContext|@param context/
        );
        expect(contentOf(quiet, 'controllers/post-field-notes.ts')).not.toContain(
            'callerContextOf'
        );
        expect(contentOf(quiet, 'module.yaml')).toContain('noAudit:');
        expect(contentOf(OPTIONS, 'module.yaml')).not.toContain('noAudit');
    });
});

describe('the generated module.yaml', () => {
    it('parses against the strict descriptor schema, quote in the summary included', () => {
        const descriptor = moduleDescriptorSchema.parse(
            parseYaml(contentOf(OPTIONS, 'module.yaml'))
        );

        expect(descriptor.summary).toBe("It's a note.");
        expect(descriptor.group).toBe('foundation');
        expect(descriptor.dependsOn).toEqual([]);
    });

    it('parses for a noAudit module too', () => {
        expect(() =>
            moduleDescriptorSchema.parse(
                parseYaml(contentOf({ ...OPTIONS, audit: false }, 'module.yaml'))
            )
        ).not.toThrow();
    });
});

describe('the generated declarations', () => {
    it('declares one key per action, in the module family', () => {
        const { keys } = parseYaml(contentOf(OPTIONS, 'authorization.yaml')) as {
            keys: { key: string; module: string }[];
        };

        expect(keys.map((key) => key.key)).toEqual([
            'fieldnotes.any.read',
            'fieldnotes.any.create',
            'fieldnotes.any.update',
            'fieldnotes.any.delete'
        ]);
        expect(new Set(keys.map((key) => key.module))).toEqual(new Set(['field-notes']));
    });

    it('declares the paths, one operation id each, and the Replace/Update pair', () => {
        const fragment = parseYaml(contentOf(OPTIONS, 'openapi.yaml')) as {
            paths: Record<string, Record<string, { operationId: string }>>;
            components: { schemas: Record<string, unknown> };
        };
        const operations = Object.values(fragment.paths).flatMap((path) =>
            Object.values(path).map((operation) => operation.operationId)
        );

        expect(operations).toEqual([
            'listFieldNotes',
            'createFieldNote',
            'replaceFieldNote',
            'updateFieldNote',
            'deleteFieldNote'
        ]);
        expect(Object.keys(fragment.components.schemas)).toEqual(
            expect.arrayContaining(['ReplaceFieldNoteRequest', 'UpdateFieldNoteRequest'])
        );
    });

    it('keeps the docs page graph markers `docs:graph` fills', () => {
        const page = contentOf(OPTIONS, 'docs/modules/field-notes.md');

        expect(page).toContain('<!-- module-graph:field-notes:start -->');
        expect(page).toContain('<!-- module-graph:field-notes:end -->');
    });
});

describe('collidingSchemas', () => {
    it('names the schemas another module already declares', () => {
        const { names } = planModule({ ...OPTIONS, name: 'users' });

        expect(collidingSchemas(names, new Set(['User', 'Unrelated']))).toEqual(['User']);
        expect(collidingSchemas(names, new Set())).toEqual([]);
    });
});
