import type { PodRequest, RequestTrackingResponse } from "@coti/pod-sdk";

export type PollOptions = {
  intervalMs: number;
  timeoutMs: number;
  onPoll?: (status: RequestTrackingResponse, attempt: number) => void;
};

function isSuccess(status: RequestTrackingResponse): boolean {
  return (
    status.minedOnTarget &&
    status.execution === null &&
    status.isTwoWay &&
    status.response !== null &&
    status.response.minedOnTarget
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll {@link PodRequest.trackRequest} until the two-way flow completes successfully.
 * Ignores transient `errors()` records while the callback leg is still pending.
 */
export async function pollUntilComplete(
  tracker: PodRequest,
  sourceChainId: number | bigint,
  requestId: string,
  options: PollOptions
): Promise<RequestTrackingResponse> {
  const started = Date.now();
  let attempt = 0;
  let last: RequestTrackingResponse | null = null;

  while (Date.now() - started < options.timeoutMs) {
    attempt += 1;
    const status = await tracker.trackRequest(sourceChainId, requestId);
    last = status;
    options.onPoll?.(status, attempt);
    if (isSuccess(status)) return status;
    await sleep(options.intervalMs);
  }

  throw new Error(
    `PodRequest: timed out after ${options.timeoutMs}ms waiting for request ${requestId}` +
      (last?.execution
        ? ` (last execution code=${last.execution.errorCode})`
        : "")
  );
}
