export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'CSRF_INVALID'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'SUBSCRIPTION_INACTIVE'
  | 'PLAN_LIMIT'
  | 'NOT_FOUND'
  | 'BUSINESS_NAME_TAKEN'
  | 'USERNAME_TAKEN'
  | 'LAST_ADMIN'
  | 'BARCODE_TAKEN'
  | 'INSUFFICIENT_STOCK'
  | 'PRICE_CHANGED'
  | 'PRODUCT_UNAVAILABLE'
  | 'INVALID_TRANSITION'
  | 'NOT_BILLABLE'
  | 'ALREADY_VOIDED'
  | 'IMPORT_NOT_ALLOWED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'PAYMENT_MISMATCH'
  | 'PAYMENT_DETAILS_REQUIRED'
  | 'CREDIT_REQUIRES_CUSTOMER'
  | 'SETTLEMENT_EXCEEDS_BALANCE'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static validationError(message = 'Validation failed', details?: Record<string, unknown>): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static badRequest(message = 'Invalid request', details?: Record<string, unknown>): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unprocessable(message = 'Unprocessable entity', details?: Record<string, unknown>): AppError {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }

  static unauthenticated(message = 'Authentication required'): AppError {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }

  static invalidCredentials(message = 'Invalid username or password'): AppError {
    return new AppError(401, 'INVALID_CREDENTIALS', message);
  }

  static forbidden(message = 'Access denied'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static csrfInvalid(message = 'Invalid or missing CSRF token'): AppError {
    return new AppError(403, 'CSRF_INVALID', message);
  }

  static passwordChangeRequired(message = 'Password change required'): AppError {
    return new AppError(403, 'PASSWORD_CHANGE_REQUIRED', message);
  }

  static subscriptionInactive(message = 'Subscription is inactive. Please renew.'): AppError {
    return new AppError(403, 'SUBSCRIPTION_INACTIVE', message);
  }

  static planLimit(message = 'Plan limit exceeded. Upgrade required.'): AppError {
    return new AppError(403, 'PLAN_LIMIT', message);
  }

  static notFound(message = 'Record not found'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static businessNameTaken(message = 'Business name is already registered'): AppError {
    return new AppError(409, 'BUSINESS_NAME_TAKEN', message);
  }

  static usernameTaken(message = 'Username is already taken in this business'): AppError {
    return new AppError(409, 'USERNAME_TAKEN', message);
  }

  static lastAdmin(message = 'Cannot disable or change role of the last active Admin'): AppError {
    return new AppError(409, 'LAST_ADMIN', message);
  }

  static accountLocked(message = 'Too many attempts. Try again in 15 minutes.'): AppError {
    return new AppError(423, 'ACCOUNT_LOCKED', message);
  }

  static rateLimited(message = 'Too many requests. Please try again later.'): AppError {
    return new AppError(429, 'RATE_LIMITED', message);
  }

  static barcodeTaken(message = 'Barcode is already in use by another product'): AppError {
    return new AppError(409, 'BARCODE_TAKEN', message);
  }

  static fileTooLarge(message = 'File size exceeds maximum allowed limit (2 MB)'): AppError {
    return new AppError(413, 'FILE_TOO_LARGE', message);
  }

  static unsupportedFile(
    message = 'Only JPEG, PNG and WebP images are supported. SVG is not allowed.'
  ): AppError {
    return new AppError(415, 'UNSUPPORTED_FILE', message);
  }

  static insufficientStock(
    message = 'Insufficient stock',
    details?: Record<string, unknown>
  ): AppError {
    return new AppError(409, 'INSUFFICIENT_STOCK', message, details);
  }

  static productUnavailable(message = 'Product is untracked or unavailable'): AppError {
    return new AppError(409, 'PRODUCT_UNAVAILABLE', message);
  }

  static settlementExceedsBalance(
    message = 'Settlement amount cannot exceed outstanding balance',
    details?: Record<string, unknown>
  ): AppError {
    return new AppError(422, 'SETTLEMENT_EXCEEDS_BALANCE', message, details);
  }

  static paymentDetailsRequired(message = 'Payment details required'): AppError {
    return new AppError(422, 'PAYMENT_DETAILS_REQUIRED', message);
  }

  static priceChanged(
    message = 'One or more product prices have changed',
    details?: Record<string, unknown>
  ): AppError {
    return new AppError(409, 'PRICE_CHANGED', message, details);
  }

  static paymentMismatch(
    message = 'Payments do not match sale total',
    details?: Record<string, unknown>
  ): AppError {
    return new AppError(422, 'PAYMENT_MISMATCH', message, details);
  }

  static creditRequiresCustomer(
    message = 'Select a customer before adding a credit payment'
  ): AppError {
    return new AppError(422, 'CREDIT_REQUIRES_CUSTOMER', message);
  }

  static invalidTransition(message = 'Invalid kitchen order status transition'): AppError {
    return new AppError(409, 'INVALID_TRANSITION', message);
  }

  static notBillable(message = 'Order is not in a billable state'): AppError {
    return new AppError(409, 'NOT_BILLABLE', message);
  }

  static alreadyVoided(message = 'Sale is already voided'): AppError {
    return new AppError(409, 'ALREADY_VOIDED', message);
  }

  static internal(message = 'An unexpected internal error occurred'): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}
