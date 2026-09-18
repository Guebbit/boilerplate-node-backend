/**
 * `POST /account/export`'s guarantee is only as good as every module's own `personalData`
 * declaration — see `kernel/registry.ts`'s `PersonalDataSection`. `AppModule.personalData` being
 * required means TypeScript already refuses a module that answers nothing at all; what it cannot
 * catch is a module that answers `'none'` while its own models plainly hold a subject-linked
 * field — "you said nothing, but you hold something."
 *
 * Checked structurally, by grepping each `'none'` module's own `model.ts` — the one file every
 * module that owns a collection declares its schema in (`docs/reference/data.md`) — for a field
 * spelled `userId`, `createdByUserId` or `ownerId`. Narrowed to that one file on purpose: a
 * `userId` PARAMETER name is everywhere (`account`, which owns no collection at all, reads and
 * writes other modules' data by id throughout its own services), and only a persisted schema
 * field says anything about what this module itself STORES. A field that merely mentions a person
 * without being a stored reference to one (`webhooks`' `ownerEmail`, an operator's own address,
 * not an export subject's; `locales`' `translatedBy`, a staff name string, not a reference) is not
 * what this check is for either — see each module's own `personalData: 'none'` comment for why
 * it's excluded, and `ALLOWED` below if a real false positive ever needs recording.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

/** A field name that means "this row belongs to a person" in this repo's models. */
const SUBJECT_FIELD = /\b(userId|createdByUserId|ownerId)\s*[:?]/;

/**
 * `module → field` pairs a maintainer has reviewed and decided are NOT a data-export gap, with
 * the reason inline. Empty on purpose — nothing has needed it yet; a real false positive goes
 * here rather than weakening `SUBJECT_FIELD` for everyone.
 */
const ALLOWED: Readonly<Record<string, string>> = {};

/** A module's own `model.ts`, or `undefined` for a module that owns no collection at all. */
const modelFile = (moduleName: string): string | undefined => {
    const file = path.join(MODULES_ROOT, moduleName, 'model.ts');
    return existsSync(file) ? file : undefined;
};

describe('personal-data sections', () => {
    it("refuses 'none' from a module whose own model.ts holds an obvious subject-linked field", () => {
        const gaps: string[] = [];

        for (const appModule of enabledModules) {
            if (appModule.personalData !== 'none') continue;
            if (ALLOWED[appModule.name]) continue;

            const file = modelFile(appModule.name);
            if (!file) continue; // owns no collection at all — nothing to check

            const match = SUBJECT_FIELD.exec(readFileSync(file, 'utf8'));
            if (match)
                gaps.push(`${appModule.name} says 'none' but model.ts declares \`${match[1]}\``);
        }

        expect(gaps).toEqual([]);
    });

    it('never lets a module say nothing at all — every module resolves a real value', () => {
        // Belt-and-braces alongside the type system: `AppModule.personalData` is required, so this
        // can only fail if something bypasses the type (a cast, a stub) — worth a loud test
        // failure rather than a silent `undefined` reaching `resolvePersonalDataSections`.
        const unset = enabledModules.filter((appModule) => appModule.personalData === undefined);

        expect(unset.map((appModule) => appModule.name)).toEqual([]);
    });
});
