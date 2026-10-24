import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeployed, MODULES_ROOT } from '@tests/paths';

/**
 * Guard: a module that stores rows about a person says how they are erased.
 *
 * A model with a `ref: 'User'` field, or a plain `userId` / `…UserId` field holding an account id,
 * holds data about an account. A hard delete (Art. 17) runs every module's `personalData.erase`
 * hook inside one transaction, so a module that holds such a model and declares no hook leaves the
 * person's rows behind, silently, in the one place nobody looks. This pins the declaration: its
 * presence, not its correctness (each module's own tests hold that; the real cascade is
 * `tests/integration/erasure.test.ts`).
 *
 * Read as text, not by loading the modules: the question is what a developer wrote down, and a
 * module that fails to load would otherwise vanish from the check instead of failing it.
 *
 * Modules that hold such a reference but erase some other way are named here, each with the reason.
 */

/** Modules exempt from carrying an `erase` hook, with why. Add only with an argument. */
const EXEMPT: Record<string, string> = {
    users: 'the cascade itself: it runs every hook, then deletes the account document',
    'audit-logs':
        'the trail keeps actorUserId and targetId for the audit window (Art. 6(1)(c) and (f), recital 49): it is the record of what happened, not data kept about the person'
};

/** A field that names an account: a `ref: 'User'`, or a `userId` / `…UserId` key holding its id. */
const NAMES_AN_ACCOUNT = /ref:\s*'User'|\b[a-zA-Z]*[uU]serId\??\s*:/;

/** Every module folder whose `model.ts` names an account. */
const modulesHoldingUserRows = readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
        const model = path.join(MODULES_ROOT, name, 'model.ts');
        return existsSync(model) && NAMES_AN_ACCOUNT.test(readFileSync(model, 'utf8'));
    })
    .toSorted();

describe('personal data erasure', () => {
    it('finds the modules that hold rows about an account (the guard is not vacuous)', () => {
        // An exact floor, not `>= 1`: a refactor that renames the ref must fail here, not pass empty.
        // The shop's modules count only while deployed: the floor holds without the shop. `access`,
        // `api-keys` and `webhooks` name an account by a plain id string, which `ref: 'User'` missed.
        expect(modulesHoldingUserRows).toEqual(
            expect.arrayContaining(
                [
                    'access',
                    'account',
                    'addresses',
                    'api-keys',
                    'cart',
                    'notifications',
                    'webhooks'
                ].filter((name) => isDeployed(name))
            )
        );
    });

    it.each(modulesHoldingUserRows.filter((name) => !(name in EXEMPT)))(
        '%s declares an erase hook in its manifest',
        (name) => {
            const manifest = readFileSync(path.join(MODULES_ROOT, name, 'module.ts'), 'utf8');

            expect(manifest).toMatch(/personalData:/);
            expect(manifest).toMatch(/\berase:/);
        }
    );
});
