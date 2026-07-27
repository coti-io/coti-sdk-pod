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
const FUJI_CHAIN_ID = 43113n;

/**
 * Inbox request ids pack `source(64) | target(64) | nonce(128)`.
 * Seeded ids are recent live `MessageSent` events on inbox v2.2
 * (`0x3b8B70819f27e0438cBcE7f31894f799da52648F`).
 */
const SEEDED_REQUEST_IDS: Array<{ chainId: bigint; requestId: string }> = [
  // Sepolia → COTI testnet (nonces 0xc..0xe)
  {
    chainId: SEPOLIA_CHAIN_ID,
    requestId:
      "0x0000000000aa36a700000000006c11a00000000000000000000000000000000c",
  },
  {
    chainId: SEPOLIA_CHAIN_ID,
    requestId:
      "0x0000000000aa36a700000000006c11a00000000000000000000000000000000d",
  },
  {
    chainId: SEPOLIA_CHAIN_ID,
    requestId:
      "0x0000000000aa36a700000000006c11a00000000000000000000000000000000e",
  },
  // COTI testnet → Fuji / Sepolia
  {
    chainId: COTI_CHAIN_ID,
    requestId:
      "0x00000000006c11a0000000000000a869000000000000000000000000000000cf",
  },
  {
    chainId: COTI_CHAIN_ID,
    requestId:
      "0x00000000006c11a00000000000aa36a700000000000000000000000000000008",
  },
];

/** Lower/upper nonce bounds to sweep on each source→target route (inclusive). */
const SWEEP_RANGE: Array<{
  sourceChainId: bigint;
  targetChainId: bigint;
  fromNonce: bigint;
  toNonce: bigint;
}> = [
  {
    sourceChainId: SEPOLIA_CHAIN_ID,
    targetChainId: COTI_CHAIN_ID,
    fromNonce: 0x8n,
    toNonce: 0x10n,
  },
  {
    sourceChainId: COTI_CHAIN_ID,
    targetChainId: FUJI_CHAIN_ID,
    fromNonce: 0xc8n,
    toNonce: 0xd0n,
  },
  {
    sourceChainId: COTI_CHAIN_ID,
    targetChainId: SEPOLIA_CHAIN_ID,
    fromNonce: 0x5n,
    toNonce: 0xan,
  },
];

function packRequestId(
  sourceChainId: bigint,
  targetChainId: bigint,
  nonce: bigint
): string {
  const src = sourceChainId & 0xffff_ffff_ffff_ffffn;
  const tgt = targetChainId & 0xffff_ffff_ffff_ffffn;
  const n = nonce & ((1n << 128n) - 1n);
  const packed = (src << 192n) | (tgt << 128n) | n;
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
        let ok = 0;
        for (const { chainId, requestId } of SEEDED_REQUEST_IDS) {
          try {
            const status = await tracker.trackRequest(chainId, requestId);
            report.push(renderStatus(status));
            ok += 1;
          } catch (err) {
            report.push(
              `[chain ${chainId}] ${requestId}  ERROR: ${
                (err as Error).message
              }`
            );
          }
        }
        console.log("\n=== seeded requests ===\n" + report.join("\n\n"));
        expect(ok).toBeGreaterThan(0);
      }
    );

    it(
      "sweeps nonce ranges on both chains",
      { timeout: 300_000 },
      async () => {
        const tracker = new PodRequest(config);
        const report: string[] = [];
        let found = 0;
        for (const {
          sourceChainId,
          targetChainId,
          fromNonce,
          toNonce,
        } of SWEEP_RANGE) {
          const header =
            `\n=== sweep src=${sourceChainId} tgt=${targetChainId} ` +
            `nonces=${fromNonce}..${toNonce} ===`;
          report.push(header);
          const tasks: Array<Promise<string>> = [];
          for (let n = fromNonce; n <= toNonce; n++) {
            const requestId = packRequestId(sourceChainId, targetChainId, n);
            tasks.push(
              tracker
                .trackRequest(sourceChainId, requestId)
                .then((s) => {
                  found += 1;
                  return renderStatus(s, `n=${n.toString().padStart(3)} `);
                })
                .catch(
                  (err) =>
                    `n=${n.toString().padStart(3)} ${requestId}  not-found (${(err as Error).message})`
                )
            );
          }
          const results = await Promise.all(tasks);
          report.push(...results);
        }
        console.log(report.join("\n"));
        expect(found).toBeGreaterThan(0);
      }
    );
  }
);
