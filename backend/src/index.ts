import 'reflect-metadata';
import 'dotenv/config';

import { AppDataSource, normalizeLegacyPaperStatuses } from './data-source';
import app from './app';
import { startOverdueChecker } from './jobs/overdueChecker';

const PORT = process.env.PORT || 3001;

normalizeLegacyPaperStatuses()
    .then(() => AppDataSource.initialize())
    .then(() => {
        console.log('✅ Database connected & Models strictly synchronized!');
        startOverdueChecker();
        const server = app.listen(Number(PORT), '0.0.0.0', () => {
            console.log(`🚀 Server started and accessible on http://10.202.199.70:${PORT}`);
        });
        server.timeout = 600000; // 10 minutes — long-running AI endpoints
    })
    .catch((error) => console.error('❌ Database Connection Error: ', error));
