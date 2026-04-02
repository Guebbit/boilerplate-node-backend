import { start } from './database';

void start().then(() => {
    process.exit(0);
});
