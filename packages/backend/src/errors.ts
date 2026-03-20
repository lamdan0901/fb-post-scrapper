export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
  readonly statusCode = 404;

  constructor(message = "Resource not found") {
    super(message);
  }
}

export class ValidationError extends Error {
  override readonly name = "ValidationError";
  readonly statusCode = 400;

  constructor(message = "Validation failed") {
    super(message);
  }
}

export class ConflictError extends Error {
  override readonly name = "ConflictError";
  readonly statusCode = 409;

  constructor(message = "Conflict") {
    super(message);
  }
}
