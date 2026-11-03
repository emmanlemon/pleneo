import { z } from 'zod';

const schema = z.object({ bffUrl: z.url() });

export const env = schema.parse({
  bffUrl: process.env.NEXT_PUBLIC_BFF_URL ?? 'http://localhost:4100',
});
