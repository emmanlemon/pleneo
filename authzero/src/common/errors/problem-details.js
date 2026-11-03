const TITLES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  423: 'Locked',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function toProblemDetails(error, req) {
  return {
    type: `urn:authzero:error:${error.code.toLowerCase().replace(/_/g, '-')}`,
    title: TITLES[error.status] ?? 'Error',
    status: error.status,
    code: error.code,
    detail: error.message,
    instance: req.originalUrl,
    requestId: req.id,
    ...(error.details ? { errors: error.details } : {}),
  };
}
