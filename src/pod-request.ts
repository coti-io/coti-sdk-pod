/**
 * Cross-chain request tracker: given a `requestId`, resolves its state on both
 * source and target PoD inboxes (mined? executed? errored? two-way response?)
 * so callers can poll until the flow is complete.
 */

import { ethers } from "ethers";
import type { PodChainConfig, PodSdkConfig } from "./config.js";
import {
  PodSdkError,
  RequestNotFoundError,
  RequestTrackingCycleError,
  WaitForRequestTimeoutError,
} from "./errors.js";

/**
 * Inbox error codes mirrored from `InboxBase.sol`.
 * - `EXECUTION_FAILED` (1): target-contract call reverted.
 * - `ENCODE_FAILED`    (2): MPC re-encoding of calldata failed before the call.
 */
export const ERROR_CODE_EXECUTION_FAILED = 1n;
export const ERROR_CODE_ENCODE_FAILED = 2n;

/** Execution failure captured by the target inbox (empty when the call succeeded). */
export interface ExecutionError {
  /** Matches `ERROR_CODE_*` constants. */
  errorCode: bigint;
  /** ABI-decoded when the payload is `Error(string)` / `Panic(uint256)` / UTF-8; raw hex otherwise. */
  errorMessage: string;
  /** Raw bytes as stored in `errors[requestId].errorMessage`. */
  errorMessageRaw: string;
}

/**
 * Result of {@link PodRequest.trackRequest}.
 *
 * For two-way flows, `response` is the recursive tracking of the inbox-generated
 * reply message (target → source) so callers can observe the full round-trip.
 */
export interface RequestTrackingResponse {
  /** Source-chain timestamp when the outbound request was created. */
  timestamp: bigint;
  sourceChainId: bigint;
  targetChainId: bigint;
  requestId: string;
  /** `true` once a miner ingested this request on the target inbox. */
  minedOnTarget: boolean;
  /** `true` once the target inbox marked the request as executed. */
  executedOnTarget: boolean;
  isTwoWay: boolean;
  /** Tracking of the linked response request (two-way only), or `null` if not sent yet. */
  response: RequestTrackingResponse | null;
  /** `Request.callerFee` — gas-unit budget for the local (callback) leg. */
  localGasLimit: bigint;
  /** `Request.targetFee` — gas-unit budget for the remote execution leg. */
  remoteGasLimit: bigint;
  /** Populated when the target-side encode or subcall failed. */
  execution: ExecutionError | null;
}

/** Terminal condition for {@link PodRequest.waitForRequest}. */
export type WaitForRequestUntil = "mined" | "executed" | "complete";

export interface WaitForRequestOptions {
  /** Stop when this lifecycle stage is reached (default `"executed"`). */
  until?: WaitForRequestUntil;
  /** Poll interval in milliseconds (default 3_000). */
  intervalMs?: number;
  /** Maximum wait time in milliseconds (default 300_000). */
  timeoutMs?: number;
  /** Abort polling when this signal is aborted. */
  signal?: AbortSignal;
}

const INBOX_TRACKING_ABI: ReadonlyArray<string> = [
  "function requests(bytes32) view returns (" +
    "bytes32 requestId," +
    "uint256 targetChainId," +
    "address targetContract," +
    "(bytes4 selector, bytes data, bytes8[] datatypes, bytes32[] datalens) methodCall," +
    "address callerContract," +
    "address originalSender," +
    "uint64 timestamp," +
    "bytes4 callbackSelector," +
    "bytes4 errorSelector," +
    "bool isTwoWay," +
    "bool executed," +
    "bytes32 sourceRequestId," +
    "uint256 targetFee," +
    "uint256 callerFee)",
  "function incomingRequests(bytes32) view returns (" +
    "bytes32 requestId," +
    "uint256 targetChainId," +
    "address targetContract," +
    "(bytes4 selector, bytes data, bytes8[] datatypes, bytes32[] datalens) methodCall," +
    "address callerContract," +
    "address originalSender," +
    "uint64 timestamp," +
    "bytes4 callbackSelector," +
    "bytes4 errorSelector," +
    "bool isTwoWay," +
    "bool executed," +
    "bytes32 sourceRequestId," +
    "uint256 targetFee," +
    "uint256 callerFee)",
  "function errors(bytes32) view returns (bytes32 requestId, uint64 errorCode, bytes errorMessage)",
  "function inboxResponses(bytes32) view returns (bytes32 responseRequestId, bytes response)",
];

const ZERO_REQUEST_ID = ethers.ZeroHash;
const ERROR_STRING_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";

/**
 * Best-effort decode of Solidity revert / error-message bytes into a human
 * string. Falls back to UTF-8, then hex, so the caller always gets something.
 */
export function decodeInboxErrorMessage(raw: string): string {
  if (!raw || raw === "0x") return "";
  const normalized = raw.toLowerCase();

  if (normalized.startsWith(ERROR_STRING_SELECTOR) && raw.length >= 10) {
    try {
      const [msg] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["string"],
        "0x" + raw.slice(10)
      );
      if (typeof msg === "string" && msg.length > 0) return msg;
    } catch {
      /* fall through */
    }
  }

  if (normalized.startsWith(PANIC_SELECTOR) && raw.length >= 10) {
    try {
      const [code] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256"],
        "0x" + raw.slice(10)
      );
      return `Panic(0x${(code as bigint).toString(16)})`;
    } catch {
      /* fall through */
    }
  }

  try {
    const text = ethers.toUtf8String(raw);
    if (text.length > 0 && /^[\x09\x0A\x0D\x20-\x7E]+$/.test(text)) return text;
  } catch {
    /* fall through */
  }

  return raw;
}

/** Whether `status` satisfies the requested {@link WaitForRequestUntil} stage. */
export function isRequestTrackingComplete(
  status: RequestTrackingResponse,
  until: WaitForRequestUntil
): boolean {
  switch (until) {
    case "mined":
      return status.minedOnTarget;
    case "executed":
      return status.minedOnTarget && status.executedOnTarget;
    case "complete":
      if (!status.isTwoWay) {
        return status.minedOnTarget && status.executedOnTarget;
      }
      return (
        status.response !== null &&
        status.response.minedOnTarget &&
        status.response.executedOnTarget
      );
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PodSdkError("waitForRequest aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new PodSdkError("waitForRequest aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Polling-friendly client that fans out view calls across configured chains to
 * reconstruct the lifecycle of a cross-chain PoD request.
 *
 * Prefer {@link waitForRequest} for blocking until a terminal state; use
 * {@link trackRequest} when you manage polling yourself.
 *
 * @example
 * const config = {
 *   chains: [
 *     { chainId: 11155111, inboxAddress: SEPOLIA_DEFAULT_INBOX_ADDRESS, rpcUrl: sepoliaRpc },
 *     { chainId: 7082400,  inboxAddress: COTI_TESTNET_DEFAULT_INBOX_ADDRESS, rpcUrl: cotiRpc },
 *   ],
 * };
 * const tracker = new PodRequest(config);
 * const status = await tracker.waitForRequest(11155111n, requestId, { until: "executed" });
 */
export class PodRequest {
  private readonly chains: Map<string, PodChainConfig>;
  private readonly inboxCache: Map<string, ethers.Contract> = new Map();

  constructor(config: PodSdkConfig) {
    if (!config?.chains?.length) {
      throw new Error("PodRequest: at least one chain is required");
    }
    this.chains = new Map();
    for (const c of config.chains) {
      const key = String(c.chainId);
      if (this.chains.has(key)) {
        throw new Error(`PodRequest: duplicate chain config for ${key}`);
      }
      if (!c.inboxAddress) {
        throw new Error(`PodRequest: inboxAddress missing for chain ${key}`);
      }
      if (!c.rpcUrl) {
        throw new Error(`PodRequest: rpcUrl missing for chain ${key}`);
      }
      this.chains.set(key, c);
    }
  }

  /** Configured chain ids. */
  get chainIds(): number[] {
    return [...this.chains.values()].map((c) => c.chainId);
  }

  /**
   * Resolve the current state of `requestId` using the source inbox (where the
   * request was emitted) and, when configured, the target inbox.
   *
   * @param chainId Source chain id (where the request was sent from).
   * @param requestId 32-byte packed request id returned by {@link PodContract.extractRequestIds}.
   */
  async trackRequest(
    chainId: number | bigint | string,
    requestId: string
  ): Promise<RequestTrackingResponse> {
    return this._track(chainId, requestId, new Set());
  }

  /**
   * Poll {@link trackRequest} until the request reaches the requested lifecycle stage.
   *
   * @throws {@link WaitForRequestTimeoutError} when `timeoutMs` elapses first.
   */
  async waitForRequest(
    chainId: number | bigint | string,
    requestId: string,
    options?: WaitForRequestOptions
  ): Promise<RequestTrackingResponse> {
    const until = options?.until ?? "executed";
    const intervalMs = options?.intervalMs ?? 3_000;
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const started = Date.now();

    for (;;) {
      const status = await this.trackRequest(chainId, requestId);
      if (isRequestTrackingComplete(status, until)) return status;

      if (Date.now() - started >= timeoutMs) {
        throw new WaitForRequestTimeoutError(chainId, requestId, until, timeoutMs);
      }

      await sleep(intervalMs, options?.signal);
    }
  }

  private inboxFor(chainId: bigint | number | string): ethers.Contract | undefined {
    const key = String(BigInt(chainId));
    const cached = this.inboxCache.get(key);
    if (cached) return cached;
    const cfg = this.chains.get(key);
    if (!cfg) return undefined;
    const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
    const contract = new ethers.Contract(cfg.inboxAddress, INBOX_TRACKING_ABI, provider);
    this.inboxCache.set(key, contract);
    return contract;
  }

  private async _track(
    chainId: number | bigint | string,
    requestId: string,
    seen: Set<string>
  ): Promise<RequestTrackingResponse> {
    const sourceKey = String(BigInt(chainId));
    const source = this.inboxFor(chainId);
    if (!source) {
      throw new Error(
        `PodRequest: no chain config for source chain ${sourceKey}`
      );
    }

    const id = ethers.hexlify(requestId).toLowerCase();
    const seenKey = `${sourceKey}:${id}`;
    if (seen.has(seenKey)) {
      throw new RequestTrackingCycleError(id);
    }
    seen.add(seenKey);

    const req = await source.requests(id);
    const storedId = (req.requestId as string).toLowerCase();
    if (storedId === ZERO_REQUEST_ID) {
      throw new RequestNotFoundError(sourceKey, id);
    }

    const sourceChainId = BigInt(sourceKey);
    const targetChainId = BigInt(req.targetChainId as bigint);
    const isTwoWay = Boolean(req.isTwoWay);
    const timestamp = BigInt(req.timestamp as bigint);
    const remoteGasLimit = BigInt(req.targetFee as bigint);
    const localGasLimit = BigInt(req.callerFee as bigint);

    const target = this.inboxFor(targetChainId);

    let minedOnTarget = false;
    let executedOnTarget = false;
    let execution: ExecutionError | null = null;
    let responseRequestId = ZERO_REQUEST_ID;

    if (target) {
      const [incoming, err, responseRecord] = await Promise.all([
        target.incomingRequests(id),
        target.errors(id),
        isTwoWay
          ? target.inboxResponses(id)
          : Promise.resolve({ responseRequestId: ZERO_REQUEST_ID, response: "0x" }),
      ]);

      minedOnTarget =
        (incoming.requestId as string).toLowerCase() !== ZERO_REQUEST_ID;
      if (minedOnTarget) {
        executedOnTarget = Boolean(incoming.executed);
      }

      const errStoredId = (err.requestId as string).toLowerCase();
      if (errStoredId !== ZERO_REQUEST_ID) {
        const rawMsg = ethers.hexlify(err.errorMessage as ethers.BytesLike);
        execution = {
          errorCode: BigInt(err.errorCode as bigint),
          errorMessage: decodeInboxErrorMessage(rawMsg),
          errorMessageRaw: rawMsg,
        };
      }

      const respId = (
        responseRecord.responseRequestId as string
      ).toLowerCase();
      if (respId !== ZERO_REQUEST_ID) responseRequestId = respId;
    }

    let response: RequestTrackingResponse | null = null;
    if (responseRequestId !== ZERO_REQUEST_ID && this.chains.has(targetChainId.toString())) {
      response = await this._track(targetChainId, responseRequestId, seen);
    }

    return {
      timestamp,
      sourceChainId,
      targetChainId,
      requestId: id,
      minedOnTarget,
      executedOnTarget,
      isTwoWay,
      response,
      localGasLimit,
      remoteGasLimit,
      execution,
    };
  }
}
