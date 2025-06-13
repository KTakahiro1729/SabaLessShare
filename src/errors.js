export class InvalidLinkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidLinkError';
  }
}

export class ExpiredLinkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExpiredLinkError';
  }
}

export class PasswordRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PasswordRequiredError';
  }
}

export class DecryptionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecryptionError';
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message = 'Payload too large for simple mode. Please use Cloud Mode instead.') {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}
