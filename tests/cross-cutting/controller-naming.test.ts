/**
 * Every controller file is named for the HTTP verbs it serves.
 *
 * `<verb>-<thing>.ts`, where the verb is one of the five methods this API answers or the `write-`
 * prefix that pairs create with update. The point is not tidiness — it is that a reader looking for
 * the handler behind `DELETE /account/addresses/:id` can find the file by guessing its name, and
 * that `ls controllers/` sorts into the shape of the resource rather than into alphabetical soup.
 *
 * There was exactly one exception until recently: `account/controllers/addresses.ts` held four
 * handlers under a resource-form name. Documenting that as a second legal form was the alternative,
 * and it was rejected for a reason worth recording, because it will come back the next time a
 * resource has four endpoints: a second form has to be guarded too, the guard needs an allowlist,
 * and an allowlist is a hand-maintained list of exceptions — the category this repo removes
 * everywhere else. Splitting the file cost three files and left this assertion with nothing to
 * excuse.
 *
 * **So the value of this test is that it has no allowlist.** If one is ever added, the convention
 * has become folklore again and the exception is what needs the argument, not the rule.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MODULES_ROOT = path.join(__dirname, '..', '..', 'src', 'modules');

/**
 * `write-` earns its place beside the five methods: create and update share a validated body and a
 * success shape, and `products`, `orders` and `users` all pair them in one file already.
 */
const CONTROLLER_FILENAME = /^(get|post|put|patch|delete|write)-[\da-z-]+\.ts$/;

/**
 * Every controller file, discovered rather than listed.
 *
 * Discovery is the point: a property asserted of "every controller" has to mean every controller
 * wherever it lives, so a new domain falls under this guard by existing rather than by someone
 * remembering to add it here.
 */
const listControllers = (): string[] =>
    readdirSync(MODULES_ROOT).flatMap((moduleName) => {
        const directory = path.join(MODULES_ROOT, moduleName, 'controllers');
        if (!existsSync(directory)) return [];

        return readdirSync(directory)
            .filter((file) => file.endsWith('.ts'))
            .map((file) => `${moduleName}/controllers/${file}`);
    });

describe('controller filenames', () => {
    const controllers = listControllers();

    it('finds the controllers it means to check', () => {
        // A canary: an empty sweep would pass the assertion below over nothing at all.
        expect(controllers.length).toBeGreaterThan(30);
    });

    it('all start with the HTTP verb they serve, with no exceptions', () => {
        const offenders = controllers.filter(
            (file) => !CONTROLLER_FILENAME.test(path.basename(file))
        );

        expect(offenders).toEqual([]);
    });
});
