import request from 'supertest';
import { createApp } from '../../src/app.js';

export const app = createApp();
export const api = () => request(app);

export const expectProblem = (res, status, code) => {
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  if (res.body.code !== code) throw new Error(`expected code ${code}, got ${res.body.code}`);
  if (!res.headers['content-type'].startsWith('application/problem+json')) throw new Error('expected problem+json');
};
