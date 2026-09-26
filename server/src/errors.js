// Errors that become JSON responses: {"error": message, "details"?: ...}.
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** 422 invalid_config: details = [{machine_id, errors: [app error strings]}]. */
export class CatalogError extends HttpError {
  constructor(details) {
    super(422, 'invalid_config', details);
  }
}
