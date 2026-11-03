export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export class ValidationError extends AppError {
  constructor(errors) {
    super(400, 'VALIDATION_FAILED', 'One or more validation errors occurred', errors);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(400, code, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT') {
    super(409, code, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor() {
    super(413, 'PAYLOAD_TOO_LARGE', 'Request payload exceeds the allowed size');
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }
}

export class LockedError extends AppError {
  constructor(message = 'Account temporarily locked', code = 'ACCOUNT_LOCKED') {
    super(423, code, message);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, 'RATE_LIMITED', 'Too many requests');
  }
}

export class InternalError extends AppError {
  constructor() {
    super(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    this.isOperational = false;
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(503, 'SERVICE_UNAVAILABLE', message);
    this.isOperational = false;
  }
}
