import type { PodRequest, RequestTrackingResponse } from "@coti-io/pod-sdk";

export type PollOptions = {
  intervalMs: number;
  timeoutMs: number;
  onPoll?: (status: RequestTrackingResponse, attempt: number) => void;
  /**
   * When the live relay has not mined the outbound leg after this many ms,
   * invoke once (e.g. self-mine). Return-leg mining can use the same hook when
   * `response` exists but is not mined yet.
   */
  selfMineAfterMs?: number;
  onNeedsMine?: (phase: "outbound" | "return", status: RequestTrackingResponse) => Promise<void>;
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
  let minedOutbound = false;
  let minedReturn = false;
  const selfMineAfterMs = options.selfMineAfterMs ?? 45_000;

  while (Date.now() - started < options.timeoutMs) {
    attempt += 1;
    const status = await tracker.trackRequest(sourceChainId, requestId);
    last = status;
    options.onPoll?.(status, attempt);
    if (isSuccess(status)) return status;

    const elapsed = Date.now() - started;
    if (options.onNeedsMine && elapsed >= selfMineAfterMs) {
      if (!status.minedOnTarget && !minedOutbound) {
        minedOutbound = true;
        await options.onNeedsMine("outbound", status);
      } else if (
        status.minedOnTarget &&
        status.response &&
        !status.response.minedOnTarget &&
        !minedReturn
      ) {
        minedReturn = true;
        await options.onNeedsMine("return", status);
      }
    }

    await sleep(options.intervalMs);
  }

  throw new Error(
    `PodRequest: timed out after ${options.timeoutMs}ms waiting for request ${requestId}` +
      (last?.execution
        ? ` (last execution code=${last.execution.errorCode})`
        : !last?.minedOnTarget
          ? " (outbound never mined — relay/miner stalled)"
          : "")
  );
}
