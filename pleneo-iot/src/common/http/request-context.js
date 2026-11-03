export const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
  requestId: req.id,
});
