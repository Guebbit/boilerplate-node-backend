/**
 * Verifies that the generated API types can be imported without runtime errors.
 * This catches missing npm packages that the codegen output depends on (e.g. a
 * new generator that pulls in an unlisted transitive dep).
 */

import * as api from '@api/models';

describe('generated API types', () => {
    it('exports expected enum const objects', () => {
        expect(api.SearchFeedbackRequestsRequestStatus).toBeDefined();
        expect(api.UpdateFeedbackRequestStatusRequestStatus).toBeDefined();
    });
});
