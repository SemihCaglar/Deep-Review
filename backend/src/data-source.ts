import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';

const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '../../db/esra_m1.sqlite');

export const AppDataSource = new DataSource({
    type: 'sqlite',
    // @ts-ignore
    database: dbPath,
    synchronize: true,
    logging: false,
    // @ts-ignore
    entities: [path.join(__dirname, '/entities/*.{ts,js}')],
    migrations: [],
    subscribers: [],
});
