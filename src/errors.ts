/** Base class for structured PoD SDK errors. */
export class PodSdkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.cause = options?.cause;
  }
}

/** HTTP encryption service returned a non-OK response or malformed payload. */
export class EncryptionServiceError extends PodSdkError {
  readonly status?: number;
  readonly responseBody?: string;

  constructor(
    message: string,
    options?: { cause?: unknown; status?: number; responseBody?: string }
  ) {
    super(message, options);
    this.status = options?.status;
    this.responseBody = options?.responseBody;
  }
}

/** No inbox configuration exists for the connected or requested chain. */
export class InboxConfigError extends PodSdkError {
  readonly chainId: string;

  constructor(chainId: string | number | bigint, message?: string) {
    const id = String(chainId);
    super(message ?? `no inbox configuration for chain ${id}`);
    this.chainId = id;
  }
}

/** Inbox fee estimation inputs are invalid or the on-chain call failed. */
export class FeeEstimationError extends PodSdkError {}

/** Cross-chain request id was not found on the source inbox. */
export class RequestNotFoundError extends PodSdkError {
  readonly chainId: string;
  readonly requestId: string;

  constructor(chainId: string | number | bigint, requestId: string) {
    const id = String(chainId);
    super(`request ${requestId} not found on chain ${id}`);
    this.chainId = id;
    this.requestId = requestId;
  }
}

/** Recursive two-way response tracking detected a cycle. */
export class RequestTrackingCycleError extends PodSdkError {
  readonly requestId: string;

  constructor(requestId: string) {
    super(`cycle detected while tracking request ${requestId}`);
    this.requestId = requestId;
  }
}

/** {@link PodRequest.waitForRequest} exceeded its timeout. */
export class WaitForRequestTimeoutError extends PodSdkError {
  readonly chainId: string;
  readonly requestId: string;
  readonly until: string;
  readonly timeoutMs: number;

  constructor(
    chainId: string | number | bigint,
    requestId: string,
    until: string,
    timeoutMs: number
  ) {
    const id = String(chainId);
    super(
      `request ${requestId} on chain ${id} did not reach "${until}" within ${timeoutMs}ms`
    );
    this.chainId = id;
    this.requestId = requestId;
    this.until = until;
    this.timeoutMs = timeoutMs;
  }
}
