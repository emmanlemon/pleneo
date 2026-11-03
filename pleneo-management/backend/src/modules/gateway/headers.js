export const IDENTITY_HEADER = 'x-pleneo-identity';

const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

const FORWARD_FROM_CLIENT = ['accept-language', 'if-none-match', 'if-modified-since'];
const PASS_FROM_UPSTREAM = ['content-type', 'retry-after', 'ratelimit', 'ratelimit-policy', 'location', 'etag'];

export function upstreamHeaders(req, { identity, accessToken, hasBody }) {
  const headers = {
    accept: 'application/json',
    'x-request-id': req.id,
    'x-forwarded-for': req.ip ?? '',
    'x-forwarded-proto': req.protocol,
    'x-forwarded-host': req.get('host') ?? '',
    'user-agent': 'pleneo-gateway',
  };

  for (const name of FORWARD_FROM_CLIENT) {
    const value = req.get(name);
    if (value) headers[name] = value;
  }

  if (identity) headers[IDENTITY_HEADER] = identity;
  else if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (hasBody) headers['content-type'] = 'application/json';

  return headers;
}

export function downstreamHeaders(res, upstream) {
  for (const name of PASS_FROM_UPSTREAM) {
    const value = upstream.headers.get(name);
    if (value) res.set(name, value);
  }
  for (const name of HOP_BY_HOP) res.removeHeader(name);
  res.removeHeader('set-cookie');
}
