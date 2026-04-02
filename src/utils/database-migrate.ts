import { sequelize, start } from './database';

void start().finally(() => sequelize.close());
