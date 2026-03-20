import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";

type AppError = NotFoundError | ValidationError | ConflictError;
const isAppError = (err: unknown): err is AppError =>
  err instanceof NotFoundError ||
  err instanceof ValidationError ||
  err instanceof ConflictError;

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.issues,
    });
    return;
  }

  if (isAppError(err)) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  const status =
    typeof err.statusCode === "number" &&
    err.statusCode >= 400 &&
    err.statusCode <= 599
      ? err.statusCode
      : 500;
  const body: Record<string, unknown> = {
    error: status === 500 ? "Internal server error" : err.message,
  };

  if (process.env["NODE_ENV"] !== "production") {
    body.details = err.stack;
  }

  res.status(status).json(body);
};
