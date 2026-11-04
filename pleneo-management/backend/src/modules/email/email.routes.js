import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as h } from '#common/http/async-handler.js';
import { authenticate } from '#common/middleware/authenticate.js';
import { requirePermission } from '#common/middleware/authorize.js';
import { sensitiveLimiter } from '#common/middleware/rate-limit.js';
import { body } from '#common/validation/validator.js';
import { sendTestEmail } from './email.service.js';

export const testEmailSchema = z
  .object({
    to: z.string().trim().toLowerCase().email().max(254),
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export const emailRouter = Router();

emailRouter.post(
  '/email/test',
  authenticate,
  requirePermission('platform:manage'),
  sensitiveLimiter,
  body(testEmailSchema),
  h(async (req, res) => res.status(202).json(await sendTestEmail(req.auth, req.body))),
);
