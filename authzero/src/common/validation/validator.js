import { ValidationError } from '../errors/app-error.js';

const SOURCES = ['params', 'query', 'body'];

const CODE_MAP = {
  invalid_type: 'INVALID_TYPE',
  too_small: 'TOO_SHORT',
  too_big: 'TOO_LONG',
  invalid_format: 'INVALID_FORMAT',
  invalid_string: 'INVALID_FORMAT',
  invalid_value: 'INVALID_VALUE',
  invalid_enum_value: 'INVALID_VALUE',
  unrecognized_keys: 'UNRECOGNIZED_FIELD',
  custom: 'INVALID',
};

export const formatZodIssues = (issues, source) =>
  issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : source,
    source,
    code: CODE_MAP[issue.code] ?? issue.code.toUpperCase(),
    message: issue.message,
  }));

export const validate = (schemas) => (req, _res, next) => {
  const errors = [];
  for (const source of SOURCES) {
    const schema = schemas[source];
    if (!schema) continue;
    const result = schema.safeParse(req[source] ?? {});
    if (result.success) req[source] = result.data;
    else errors.push(...formatZodIssues(result.error.issues, source));
  }
  next(errors.length ? new ValidationError(errors) : undefined);
};

export const body = (schema) => validate({ body: schema });
export const params = (schema) => validate({ params: schema });
export const query = (schema) => validate({ query: schema });
