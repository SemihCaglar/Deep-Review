import 'reflect-metadata';
import path from 'path';
import fs from 'fs';
import { DataSource } from 'typeorm';

export const dbPath = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '../../db/esra_m1.sqlite');

export async function normalizeLegacyPaperStatuses(): Promise<void> {
    if (!fs.existsSync(dbPath)) return;

    const sqlite3 = require('sqlite3');

    await new Promise<void>((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (openErr: Error | null) => {
            if (openErr) {
                reject(openErr);
                return;
            }

            db.get(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'paper'",
                (tableErr: Error | null, row: unknown) => {
                    if (tableErr) {
                        db.close(() => reject(tableErr));
                        return;
                    }

                    if (!row) {
                        db.close((closeErr: Error | null) => closeErr ? reject(closeErr) : resolve());
                        return;
                    }

                    db.serialize(() => {
                        db.run('PRAGMA ignore_check_constraints = ON');
                        db.run(
                            `
                            UPDATE paper
                            SET status = CASE status
                                WHEN 'HumanReview' THEN 'In Review'
                                WHEN 'AIReview' THEN 'In Review'
                                WHEN 'Review Done' THEN 'Completed'
                                WHEN 'Closed' THEN 'Completed'
                                ELSE status
                            END
                            WHERE status IN ('HumanReview', 'AIReview', 'Review Done', 'Closed')
                            `,
                            (updateErr: Error | null) => {
                                db.run('PRAGMA ignore_check_constraints = OFF', (pragmaErr: Error | null) => {
                                    db.close((closeErr: Error | null) => {
                                        if (updateErr) reject(updateErr);
                                        else if (pragmaErr) reject(pragmaErr);
                                        else if (closeErr) reject(closeErr);
                                        else resolve();
                                    });
                                });
                            },
                        );
                    });
                },
            );
        });
    });
}

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
