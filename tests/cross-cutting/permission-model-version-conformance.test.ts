/**
 * The cases the PHP twin's permission-model version must answer identically:
 * `shared/cases/permission-model-version.cases.yaml`, run against `permissionModelVersion`.
 */

import { z } from 'zod';
import { permissionModelVersion } from '@kernel/permissions';
import { caseBase, describeCases } from '@tests/cases';

/** One case: a set of rule ids and the version a client sees. */
const versionCase = caseBase.extend({
    ids: z.array(z.string()),
    version: z.number().int().nonnegative()
});

describeCases('permission-model-version', versionCase, 5, (one) => {
    expect(permissionModelVersion(one.ids)).toBe(one.version);
});
