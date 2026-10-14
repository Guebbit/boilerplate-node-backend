import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeployed, MODULES_ROOT } from '@tests/paths';

/**
 * Guard: a module that stores rows about a person says how they are erased.
 *
 * A model with a `ref: 'User'` field holds data about an account. A hard delete (Art. 17) runs
 * every module's `personalData.erase` hook inside one transaction, so a module that holds such a
 * model and declares no hook leaves the person's rows behind, silently, in the one place nobody
 * looks. This pins the declaration: its presence, not its correctness (each module's own tests
 * hold that).
 *
 * Read as text, not by loading the modules: the question is what a developer wrote down, and a
 * module that fails to load would otherwise vanish from the check instead of failing it.
 *
 * Modules that hold such a reference but erase some other way are named here, each with the reason.
 */

/** Modules exempt from carrying an `erase` hook, with why. Empty on purpose: add only with an argument. */
const EXEMPT: Record<string, string> = {};

/** Every module folder whose `model.ts` references the `User` model. */
const modulesHoldingUserRows = readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
        const model = path.join(MODULES_ROOT, name, 'model.ts');
        return existsSync(model) && /ref:\s*'User'/.test(readFileSync(model, 'utf8'));
    })
    .toSorted();

describe('personal data erasure', () => {
    it('finds the modules that hold rows about an account (the guard is not vacuous)', () => {
        // An exact floor, not `>= 1`: a refactor that renames the ref must fail here, not pass empty.
        // `cart` and `notifications` count only while deployed: the floor holds without the shop.
        expect(modulesHoldingUserRows).toEqual(
            expect.arrayContaining(
                ['account', 'addresses', 'cart', 'notifications'].filter((name) => isDeployed(name))
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
