/**
 * Integration test for `PodRequest.trackRequest` against live Sepolia + Coti
 * Testnet RPCs.
 *
 * Requires `SEPOLIA_RPC_URL` and `COTI_TESTNET_RPC_URL` (GitHub `integration` environment).
 * Skips automatically when either is missing.
 *
 * Run: `npm run test:integ -- -t "PodRequest"`.
 */

import { describe, it, expect } from "vitest";
import {
  PodRequest,
  SEPOLIA_DEFAULT_INBOX_ADDRESS,
  COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
  type PodSdkConfig,
  type RequestTrackingResponse,
} from "@coti-io/pod-sdk";
import { initTestContext } from "../test-utils.js";

const SEPOLIA_CHAIN_ID = 11155111n;
const COTI_CHAIN_ID = 7082400n;

const SEEDED_REQUEST_IDS: Array<{ chainId: bigint; requestId: string }> = [
  // Requests originated on Coti testnet (chainId 0x6C11A0 embedded in upper 128 bits).
  {
    chainId: COTI_CHAIN_ID,
    requestId:
      "0x000000000000000000000000006C11A000000000000000000000000000000060",
  },
  {
    chainId: COTI_CHAIN_ID,
    requestId:
      "0x000000000000000000000000006C11A000000000000000000000000000000061",
  },
  {
    chainId: COTI_CHAIN_ID,
    requestId:
      "0x000000000000000000000000006C11A000000000000000000000000000000062",
  },
  // Requests originated on Sepolia (chainId 0xaa36a7).
  {
    chainId: SEPOLIA_CHAIN_ID,
    requestId:
      "0x00000000000000000000000000aa36a70000000000000000000000000000007a",
  },
];

/** Lower/upper nonce bounds to sweep on each chain (inclusive). */
const SWEEP_RANGE: Array<{ chainId: bigint; fromNonce: bigint; toNonce: bigint }> = [
  { chainId: COTI_CHAIN_ID, fromNonce: 0x60n, toNonce: 0x80n },
  { chainId: SEPOLIA_CHAIN_ID, fromNonce: 0x70n, toNonce: 0x90n },
];

function packRequestId(chainId: bigint, nonce: bigint): string {
  const packed = (chainId << 128n) | nonce;
  return "0x" + packed.toString(16).padStart(64, "0");
}

function renderStatus(s: RequestTrackingResponse, prefix = ""): string {
  const head =
    `${prefix}${s.requestId}  ` +
    `src=${s.sourceChainId} → tgt=${s.targetChainId}  ` +
    `ts=${s.timestamp}  ${s.isTwoWay ? "2way" : "1way"}  ` +
    `mined=${s.minedOnTarget}  executed=${s.executedOnTarget}  ` +
    `gasLimit(remote/local)=${s.remoteGasLimit}/${s.localGasLimit}`;
  const parts = [head];
  if (s.execution) {
    parts.push(
      `${prefix}  exec err code=${s.execution.errorCode} msg=${JSON.stringify(
        s.execution.errorMessage
      )}`
    );
  }
  if (s.response) {
    parts.push(`${prefix}  response:`);
    parts.push(renderStatus(s.response, prefix + "    "));
  }
  return parts.join("\n");
}

const ctx = initTestContext();
const canRun = Boolean(ctx.rpcUrl && ctx.cotiTestnetRpcUrl);

(canRun ? describe : describe.skip)(
  "PodRequest — live Sepolia + Coti testnet",
  () => {
    const config: PodSdkConfig = {
      encryptionNetwork: ctx.network,
      chains: [
        {
          chainId: SEPOLIA_CHAIN_ID,
          inboxAddress: SEPOLIA_DEFAULT_INBOX_ADDRESS,
          rpcUrl: ctx.rpcUrl!,
        },
        {
          chainId: COTI_CHAIN_ID,
          inboxAddress: COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
          rpcUrl: ctx.cotiTestnetRpcUrl!,
        },
      ],
    };

    it(
      "tracks seeded requests",
      { timeout: 120_000 },
      async () => {
        const tracker = new PodRequest(config);
        const report: string[] = [];
        for (const { chainId, requestId } of SEEDED_REQUEST_IDS) {
          try {
            const status = await tracker.trackRequest(chainId, requestId);
            report.push(renderStatus(status));
          } catch (err) {
            report.push(
              `[chain ${chainId}] ${requestId}  ERROR: ${
                (err as Error).message
              }`
            );
          }
        }
        // Always visible, even on pass.
        console.log("\n=== seeded requests ===\n" + report.join("\n\n"));
        expect(report.length).toBeGreaterThan(0);
      }
    );

    it(
      "sweeps nonce ranges on both chains",
      { timeout: 300_000 },
      async () => {
        const tracker = new PodRequest(config);
        const report: string[] = [];
        for (const { chainId, fromNonce, toNonce } of SWEEP_RANGE) {
          const header = `\n=== sweep chain=${chainId} nonces=${fromNonce}..${toNonce} ===`;
          report.push(header);
          const tasks: Array<Promise<string>> = [];
          for (let n = fromNonce; n <= toNonce; n++) {
            const requestId = packRequestId(chainId, n);
            tasks.push(
              tracker
                .trackRequest(chainId, requestId)
                .then((s) => renderStatus(s, `n=${n.toString().padStart(3)} `))
                .catch((err) => `n=${n.toString().padStart(3)} ${requestId}  not-found (${(err as Error).message})`)
            );
          }
          const results = await Promise.all(tasks);
          report.push(...results);
        }
        console.log(report.join("\n"));
        expect(report.length).toBeGreaterThan(0);
      }
    );
  }
);
