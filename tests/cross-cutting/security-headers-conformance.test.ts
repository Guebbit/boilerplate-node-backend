/**
 * The cases the PHP twin's security headers must answer identically:
 * `shared/cases/security-headers.cases.yaml`, run against a bare Express app wearing
 * `installSecurity`, so the headers are the middleware's own and no route adds or hides one.
 */

import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { installSecurity } from '@app/security';
import { caseBase, describeCases } from '@tests/cases';

/** One case: a header and either its exact value or its absence. */
const headerCase = caseBase.extend({
    header: z.string().min(1),
    value: z.string().optional(),
    absent: z.boolean().optional()
});

/** The headers of one answer from an app that only installs the security middleware. */
const answerHeaders = (): Promise<Record<string, unknown>> => {
    const app = express();
    installSecurity(app);
    app.get('/probe', (_request, response) => response.json({}));

    return request(app)
        .get('/probe')
        .then((response) => response.headers);
};

describeCases('security-headers', headerCase, (one) =>
    answerHeaders().then((headers) => {
        const actual = headers[one.header.toLowerCase()];
        if (one.absent === true) expect(actual).toBeUndefined();
        else expect(actual).toBe(one.value);
    })
);
