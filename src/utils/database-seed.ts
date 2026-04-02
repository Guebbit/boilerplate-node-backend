import { sequelize, syncSchema } from './database';

void syncSchema(true).finally(() => sequelize.close());
