import { describe, it, expect, vi } from "vitest";
import {
  PodRequest,
  isRequestTrackingComplete,
  WaitForRequestTimeoutError,
  type RequestTrackingResponse,
} from "@coti-io/pod-sdk";

function baseStatus(
  overrides: Partial<RequestTrackingResponse> = {}
): RequestTrackingResponse {
  return {
    timestamp: 1n,
    sourceChainId: 11155111n,
    targetChainId: 7082400n,
    requestId: "0x01",
    minedOnTarget: false,
    executedOnTarget: false,
    isTwoWay: false,
    response: null,
    localGasLimit: 0n,
    remoteGasLimit: 0n,
    execution: null,
    ...overrides,
  };
}

describe("isRequestTrackingComplete", () => {
  it("mined waits for target ingestion only", () => {
    expect(isRequestTrackingComplete(baseStatus(), "mined")).toBe(false);
    expect(
      isRequestTrackingComplete(baseStatus({ minedOnTarget: true }), "mined")
    ).toBe(true);
  });

  it("executed waits for target execution", () => {
    expect(
      isRequestTrackingComplete(
        baseStatus({ minedOnTarget: true, executedOnTarget: false }),
        "executed"
      )
    ).toBe(false);
    expect(
      isRequestTrackingComplete(
        baseStatus({ minedOnTarget: true, executedOnTarget: true }),
        "executed"
      )
    ).toBe(true);
  });

  it("complete for two-way flows waits for the response leg", () => {
    const oneWayDone = baseStatus({
      minedOnTarget: true,
      executedOnTarget: true,
    });
    expect(isRequestTrackingComplete(oneWayDone, "complete")).toBe(true);

    const twoWayPending = baseStatus({
      isTwoWay: true,
      minedOnTarget: true,
      executedOnTarget: true,
      response: baseStatus({ minedOnTarget: false, executedOnTarget: false }),
    });
    expect(isRequestTrackingComplete(twoWayPending, "complete")).toBe(false);

    const twoWayDone = baseStatus({
      isTwoWay: true,
      minedOnTarget: true,
      executedOnTarget: true,
      response: baseStatus({ minedOnTarget: true, executedOnTarget: true }),
    });
    expect(isRequestTrackingComplete(twoWayDone, "complete")).toBe(true);
  });
});

describe("decodeInboxErrorMessage", () => {
  it("decodes Error(string) payloads", async () => {
    const { decodeInboxErrorMessage } = await import("@coti-io/pod-sdk");
    const { ethers } = await import("ethers");
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["boom"]);
    const raw = "0x08c379a0" + encoded.slice(2);
    expect(decodeInboxErrorMessage(raw)).toBe("boom");
  });
});

describe("PodRequest.waitForRequest", () => {
  const config = {
    chains: [
      {
        chainId: 1,
        inboxAddress: "0x0000000000000000000000000000000000000001",
        rpcUrl: "http://localhost:8545",
      },
    ],
  };

  it("returns immediately when the terminal state is already reached", async () => {
    const tracker = new PodRequest(config);
    const done = baseStatus({ minedOnTarget: true, executedOnTarget: true });
    vi.spyOn(tracker, "trackRequest").mockResolvedValue(done);

    const status = await tracker.waitForRequest(1, "0x01", {
      until: "executed",
      intervalMs: 1,
      timeoutMs: 100,
    });
    expect(status).toBe(done);
    expect(tracker.trackRequest).toHaveBeenCalledTimes(1);
  });

  it("throws WaitForRequestTimeoutError when the deadline passes", async () => {
    const tracker = new PodRequest(config);
    vi.spyOn(tracker, "trackRequest").mockResolvedValue(baseStatus());

    await expect(
      tracker.waitForRequest(1, "0x01", {
        until: "executed",
        intervalMs: 5,
        timeoutMs: 20,
      })
    ).rejects.toBeInstanceOf(WaitForRequestTimeoutError);
  });
});

describe("PodRequest.trackRequest errors", () => {
  it("throws RequestNotFoundError for missing requests", async () => {
    const { RequestNotFoundError } = await import("@coti-io/pod-sdk");
    const { ethers } = await import("ethers");

    const tracker = new PodRequest({
      chains: [
        {
          chainId: 1,
          inboxAddress: "0x0000000000000000000000000000000000000001",
          rpcUrl: "http://localhost:8545",
        },
      ],
    });

    const inbox = {
      requests: vi.fn().mockResolvedValue({
        requestId: ethers.ZeroHash,
        targetChainId: 2n,
        isTwoWay: false,
        timestamp: 0n,
        targetFee: 0n,
        callerFee: 0n,
      }),
    };
    vi.spyOn(tracker as unknown as { inboxFor: () => unknown }, "inboxFor").mockReturnValue(
      inbox
    );

    await expect(tracker.trackRequest(1, "0xdead")).rejects.toBeInstanceOf(
      RequestNotFoundError
    );
  });
});
