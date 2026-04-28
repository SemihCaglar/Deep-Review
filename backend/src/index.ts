import 'reflect-metadata';
import 'dotenv/config';

import { AppDataSource } from './data-source';
import app from './app';

const PORT = process.env.PORT || 3001;

AppDataSource.initialize()
    .then(() => {
        console.log('✅ Database connected & Models strictly synchronized!');
        app.listen(PORT, () => {
            console.log(`🚀 Server started on http://localhost:${PORT}`);
        });
    })
    .catch((error) => console.error('❌ Database Connection Error: ', error));
