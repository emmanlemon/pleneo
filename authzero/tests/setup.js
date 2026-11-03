import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.DATABASE_URL ??= 'postgres://authzero:authzero@localhost:5432/authzero';
process.env.KEY_ENCRYPTION_KEY ??= 'a3f1c9e2b7d4085f6e1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70';
process.env.JWT_ISSUER ??= 'http://localhost:4000';
process.env.JWT_AUDIENCE ??= 'planeo';
