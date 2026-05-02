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
        app.listen(PORT, () => {
            console.log(`🚀 Server started on http://localhost:${PORT}`);
        });
    })
    .catch((error) => console.error('❌ Database Connection Error: ', error));
