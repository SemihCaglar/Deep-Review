import 'reflect-metadata';
import express, { Request, Response } from 'express';
import cors from 'cors';
import apiRoutes from './routes';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'BILSEN Backend API is running' });
});

app.use('/api', apiRoutes);

export default app;
