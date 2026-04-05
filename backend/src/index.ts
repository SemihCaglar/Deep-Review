import 'reflect-metadata';
import express, { Request, Response } from 'express';
import cors from 'cors';
import apiRoutes from './routes';
import { AppDataSource } from './data-source';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'BILSEN Backend API is running' });
});

app.use('/api', apiRoutes);

// Initialize DB before starting server
AppDataSource.initialize()
    .then(() => {
        console.log('✅ Database connected & Models strictly synchronized!');
        app.listen(PORT, () => {
            console.log(`🚀 Server started on http://localhost:${PORT}`);
        });
    })
    .catch((error) => console.error('❌ Database Connection Error: ', error));
