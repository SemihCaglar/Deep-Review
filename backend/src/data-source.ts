import 'reflect-metadata';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
    type: 'sqlite',
    // @ts-ignore
    database: __dirname + '/../database.sqlite',
    synchronize: true, // This automatically turns your Typescript Classes into SQL Tables!
    logging: false,
    // @ts-ignore
    entities: [__dirname + '/entities/*.{ts,js}'],
    migrations: [],
    subscribers: [],
});
