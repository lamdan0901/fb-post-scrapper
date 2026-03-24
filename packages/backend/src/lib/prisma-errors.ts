type ErrorWithCode = Error & { code?: string };

function isErrorWithCode(error: unknown): error is ErrorWithCode {
  return error instanceof Error && "code" in error;
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (isErrorWithCode(error) && error.code === "P2002") {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("UNIQUE constraint failed") ||
    error.message.includes("Unique constraint failed on the fields")
  );
}