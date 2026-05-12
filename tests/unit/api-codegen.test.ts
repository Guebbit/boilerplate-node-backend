/**
 * Verifies that the generated API types can be imported without runtime errors.
 * This catches missing npm packages that the codegen output depends on (e.g. a
 * new generator that pulls in an unlisted transitive dep).
 */

import * as api from '@api/index';

describe('generated API types', () => {
    it('exports expected enum namespaces', () => {
        expect(api.SearchFeedbackRequestsRequest).toBeDefined();
        expect(api.UpdateFeedbackRequestStatusRequest).toBeDefined();
    });
});
