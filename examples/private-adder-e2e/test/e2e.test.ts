/**
 * End-to-end PoD flow: deploy PrivateAdder (if needed), submit add(10,20),
 * track via PodRequest across Sepolia + COTI testnet, decrypt sum.
 *
 * Requires examples/private-adder-e2e/.env — see .env.example.
 * Run from this directory: npm test
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import {
  CotiPodCrypto,
  DataType,
  PodContract,
  PodRequest,
  SEPOLIA_DEFAULT_INBOX_ADDRESS,
  COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
  type PodFeeEstimationConfig,
  type PodMethodArgument,
  type PodSdkConfig,
  type RequestTrackingResponse,
} from "@coti-io/pod-sdk";
import { assertRequiredE2eEnv, loadEnv } from "../lib/env";
import { pollUntilComplete } from "../lib/poll-request";
import { resolvePrivateAdderAddress } from "../lib/resolve-contract";

const SEPOLIA_CHAIN_ID = 11155111;
const COTI_CHAIN_ID = 7082400;
const INBOX_MIN_GAS_PRICE_WEI = 2_000_000_000n;

const PRIVATE_ADDER_ABI = [
  "function add((uint256,bytes),(uint256,bytes),uint256) payable returns (bytes32)",
  "function statusByRequest(bytes32) view returns (uint8)",
  "function sumByRequest(bytes32) view returns (uint256)",
] as const;

const REQUEST_STATUS = ["None", "Pending", "Completed"] as const;

function log(section: string, detail?: string): void {
  const line = detail ? `[e2e] ${section} — ${detail}` : `[e2e] ${section}`;
  console.log(line);
}

function formatWei(wei: bigint): string {
  return `${ethers.formatEther(wei)} ETH`;
}

/**
 * Inbox fees use inclusion-time `tx.gasprice`. Pin the submitted tx to the same
 * gas price used in `estimateFee` so EIP-1559 base-fee drift cannot underfund.
 */
class GasPricePinnedWallet extends ethers.Wallet {
  constructor(
    key: string | ethers.SigningKey,
    provider: ethers.Provider | null,
    private readonly pinnedGasPrice: bigint
  ) {
    super(key, provider);
  }

  override async sendTransaction(
    tx: ethers.TransactionRequest
  ): Promise<ethers.TransactionResponse> {
    const pinned: ethers.TransactionRequest = {
      ...tx,
      gasPrice: this.pinnedGasPrice,
    };
    delete pinned.maxFeePerGas;
    delete pinned.maxPriorityFeePerGas;
    return super.sendTransaction(pinned);
  }
}

function describePollPhase(s: RequestTrackingResponse): string {
  if (!s.minedOnTarget) return "waiting for COTI testnet to mine the request";
  if (s.execution) {
    return `COTI execution failed (code ${s.execution.errorCode})`;
  }
  if (!s.response) return "MPC done on COTI; callback not sent yet";
  if (!s.response.minedOnTarget) return "callback in flight to Sepolia";
  return "round-trip complete";
}

const env = loadEnv();

describe("PrivateAdder e2e — Sepolia + COTI testnet", () => {
  let privateAdderAddress: string;

  const config: PodSdkConfig = {
    encryptionNetwork: env.encryptionNetwork,
    chains: [
      {
        chainId: SEPOLIA_CHAIN_ID,
        inboxAddress: SEPOLIA_DEFAULT_INBOX_ADDRESS,
        rpcUrl: env.sepoliaRpcUrl ?? "",
      },
      {
        chainId: COTI_CHAIN_ID,
        inboxAddress: COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
        rpcUrl: env.cotiTestnetRpcUrl ?? "",
      },
    ],
  };

  beforeAll(async () => {
    assertRequiredE2eEnv(env);
    const addr = await resolvePrivateAdderAddress(env);
    if (!addr) {
      throw new Error(
        "no PrivateAdder address (set PRIVATE_ADDER_SEPOLIA_ADDRESS, DEPLOY_ON_MISSING=true, or fix deploy)"
      );
    }
    privateAdderAddress = addr;
    log(
      "setup",
      `PrivateAdder at ${privateAdderAddress} (Sepolia inbox ${SEPOLIA_DEFAULT_INBOX_ADDRESS})`
    );
  });

  it(
    "submits add, tracks request, reads encrypted sum, decrypts to 30",
    async () => {
      const provider = new ethers.JsonRpcProvider(
        env.sepoliaRpcUrl!,
        SEPOLIA_CHAIN_ID
      );

      const feeData = await provider.getFeeData();
      const gasPrice =
        (feeData.gasPrice ?? INBOX_MIN_GAS_PRICE_WEI) < INBOX_MIN_GAS_PRICE_WEI
          ? INBOX_MIN_GAS_PRICE_WEI
          : (feeData.gasPrice ?? INBOX_MIN_GAS_PRICE_WEI);

      // Same gasPrice for fee quote and mined tx (inbox uses tx.gasprice).
      const signer = new GasPricePinnedWallet(
        env.sepoliaPrivateKey!,
        provider,
        gasPrice
      );
      const walletAddress = await signer.getAddress();
      const walletBalance = await provider.getBalance(walletAddress);

      log("wallet", `${walletAddress} (${formatWei(walletBalance)} on Sepolia)`);
      log(
        "operation",
        "private add: encrypt 10 + 20 on Sepolia, MPC add64 on COTI testnet, callback with encrypted sum"
      );

      const pod = new PodContract(
        privateAdderAddress,
        PRIVATE_ADDER_ABI,
        signer,
        { config }
      );

      const args: PodMethodArgument[] = [
        { type: DataType.itUint64, value: "10", isCallBackFee: false },
        { type: DataType.itUint64, value: "20", isCallBackFee: false },
        { type: DataType.Uint256, value: "0", isCallBackFee: true },
      ];

      const feeCfg: PodFeeEstimationConfig = {
        forwardGasLimit: 600_000n,
        forwardDataSize: 4096n,
        gasPrice,
        callBackGasLimit: 500_000n,
        callBackDataSize: 1024n,
      };

      const estimated = await pod.estimateFee("add", args, feeCfg);
      log(
        "fees",
        `total ${formatWei(estimated.totalFee)} ` +
          `(forward ${formatWei(estimated.remoteFee)} + callback ${formatWei(estimated.callBackFee)}; ` +
          `pinned gasPrice ${gasPrice.toString()} wei)`
      );

      log("submit", "calling add() via PodContract.encryptAndCallMethod …");
      const txResponse = await pod.encryptAndCallMethod("add", args, feeCfg);
      const tx = txResponse as ethers.ContractTransactionResponse;
      log("tx", `${tx.hash} (value ${formatWei(estimated.totalFee)})`);

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        log(
          "tx",
          `FAILED (status ${receipt?.status ?? "unknown"}) — not a wallet balance issue; ` +
            `usually inbox rejected msg.value (TargetFeeTooLow). Retry or raise fee gas limits.`
        );
      }
      expect(receipt?.status).toBe(1);
      expect(receipt?.gasPrice).toBe(gasPrice);
      expect(receipt?.hash).toBeTruthy();
      log("tx", `mined in block ${receipt!.blockNumber} @ ${receipt!.gasPrice} wei`);

      const requestIds = await pod.extractRequestIds(receipt!.hash);
      expect(requestIds.length).toBeGreaterThan(0);
      const requestId = requestIds[0];
      log("requestId", requestId);

      const tracker = new PodRequest(config);
      let lastPhase = "";
      log("poll", `tracking Sepolia → COTI → Sepolia (timeout ${env.pollTimeoutMs / 1000}s)`);

      const status = await pollUntilComplete(
        tracker,
        SEPOLIA_CHAIN_ID,
        requestId,
        {
          intervalMs: env.pollIntervalMs,
          timeoutMs: env.pollTimeoutMs,
          onPoll: (s, n) => {
            const phase = describePollPhase(s);
            if (phase !== lastPhase) {
              log("poll", `#${n}: ${phase}`);
              lastPhase = phase;
            }
          },
        }
      );

      log(
        "round-trip",
        `mined on COTI (chain ${status.targetChainId}); callback mined on Sepolia`
      );
      expect(status.minedOnTarget).toBe(true);
      expect(status.execution).toBeNull();
      expect(status.isTwoWay).toBe(true);
      expect(status.sourceChainId).toBe(BigInt(SEPOLIA_CHAIN_ID));
      expect(status.targetChainId).toBe(BigInt(COTI_CHAIN_ID));
      expect(status.remoteGasLimit).toBeGreaterThan(0n);
      expect(status.localGasLimit).toBeGreaterThan(0n);
      expect(status.response).not.toBeNull();
      expect(status.response!.minedOnTarget).toBe(true);

      const adder = new ethers.Contract(
        privateAdderAddress,
        PRIVATE_ADDER_ABI,
        provider
      );
      const requestStatus = await adder.statusByRequest(requestId);
      expect(Number(requestStatus)).toBe(2); // Completed
      log(
        "contract",
        `statusByRequest = ${REQUEST_STATUS[Number(requestStatus)] ?? requestStatus}`
      );

      const rawSum = await adder.sumByRequest(requestId);
      const decrypted = CotiPodCrypto.decrypt(
        rawSum.toString(),
        env.accountAesKey!,
        DataType.Uint64
      );
      log("result", `encrypted ctUint64 on-chain = ${rawSum.toString()}`);
      log("result", `decrypted sum (10 + 20) = ${decrypted}`);
      expect(decrypted).toBe("30");
      log("done", "e2e passed — private addition completed end-to-end");
    },
    env.pollTimeoutMs + 60_000
  );
});
