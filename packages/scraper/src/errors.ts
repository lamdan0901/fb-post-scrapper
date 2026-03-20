export class SessionExpiredError extends Error {
  override readonly name = "SessionExpiredError";

  constructor(message = "Facebook session expired. Please re-upload cookies.") {
    super(message);
  }
}
