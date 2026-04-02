import { syncSchema } from './database';

void syncSchema(true).then(() => {
    process.exit(0);
});
