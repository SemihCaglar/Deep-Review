import path from 'path';
// Must be set before any module imports AppDataSource
process.env.DB_PATH = path.join(__dirname, '../db/test.sqlite');
process.env.JWT_SECRET = 'test-secret-key';
