import app from './app';
import { connectDatabase } from './config/database';
import { env } from './config/environment';

const start = async (): Promise<void> => {
  try {
    await connectDatabase();
    app.listen(env.PORT, () => {
      console.log(`Server running on http://localhost:${env.PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();
