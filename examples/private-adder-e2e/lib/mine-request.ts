/**
 * Self-mine a source-inbox request onto the destination inbox when the
 * automated relay is stalled. Uses the same SEPOLIA_PRIVATE_KEY (must hold
 * destination-chain gas).
 */
import { ethers } from "ethers";

/** Minimal ABIs for getRequests / batchProcessRequests (fee-bearing MinedRequest). */
const SOURCE_ABI = [
  "function getRequestsLen(uint256 targetChainId) view returns (uint256)",
  "function getRequests(uint256 targetChainId, uint256 start, uint256 count) view returns (tuple(bytes32 requestId, uint256 targetChainId, address targetContract, tuple(bytes4 selector, bytes data, bytes8[] datatypes, bytes32[] datalens) methodCall, address callerContract, address originalSender, uint64 timestamp, bytes4 callbackSelector, bytes4 errorSelector, bool isTwoWay, bool executed, bytes32 sourceRequestId, uint256 targetFee, uint256 callerFee)[])",
] as const;

const MINER_ABI = [
  "function batchProcessRequests(uint256 sourceChainId, tuple(bytes32 requestId, address sourceContract, address targetContract, tuple(bytes4 selector, bytes data, bytes8[] datatypes, bytes32[] datalens) methodCall, bytes4 callbackSelector, bytes4 errorSelector, bool isTwoWay, bytes32 sourceRequestId, uint256 targetFee, uint256 callerFee)[] mined)",
] as const;

export type MineRequestOptions = {
  sourceRpcUrl: string;
  destRpcUrl: string;
  sourceChainId: number;
  destChainId: number;
  inboxAddress: string;
  privateKey: string;
  requestId: string;
  log?: (msg: string) => void;
};

export async function mineRequestToDestination(
  opts: MineRequestOptions
): Promise<string> {
  const log = opts.log ?? (() => undefined);
  const source = new ethers.JsonRpcProvider(opts.sourceRpcUrl, opts.sourceChainId);
  const dest = new ethers.JsonRpcProvider(opts.destRpcUrl, opts.destChainId);
  const key = opts.privateKey.startsWith("0x")
    ? opts.privateKey
    : `0x${opts.privateKey}`;
  const wallet = new ethers.Wallet(key, dest);
  const sourceInbox = new ethers.Contract(opts.inboxAddress, SOURCE_ABI, source);
  const miner = new ethers.Contract(opts.inboxAddress, MINER_ABI, wallet);

  const want = ethers.hexlify(opts.requestId).toLowerCase();
  const len = Number(await sourceInbox.getRequestsLen(opts.destChainId));
  if (len === 0) {
    throw new Error("mineRequestToDestination: source inbox has no requests");
  }

  // Scan recent tail first (e2e creates the tip request).
  const window = Math.min(len, 16);
  const start = len - window;
  const raw = await sourceInbox.getRequests(opts.destChainId, start, window);
  let found: (typeof raw)[number] | undefined;
  for (const r of raw) {
    const id = ethers.hexlify(r.requestId).toLowerCase();
    if (id === want) {
      found = r;
      break;
    }
  }
  if (!found) {
    throw new Error(
      `mineRequestToDestination: request ${want} not found in last ${window} of ${len}`
    );
  }

  const mc = found.methodCall;
  const payload = {
    requestId: found.requestId,
    sourceContract: found.originalSender,
    targetContract: found.targetContract,
    methodCall: {
      selector: mc.selector,
      data: mc.data,
      datatypes: [...mc.datatypes],
      datalens: [...mc.datalens],
    },
    callbackSelector: found.callbackSelector,
    errorSelector: found.errorSelector,
    isTwoWay: found.isTwoWay,
    sourceRequestId: found.sourceRequestId,
    targetFee: found.targetFee,
    callerFee: found.callerFee,
  };

  log(
    `self-mine ${want} → chain ${opts.destChainId} via ${wallet.address}`
  );
  const tx = await miner.batchProcessRequests(BigInt(opts.sourceChainId), [
    payload,
  ]);
  const rc = await tx.wait();
  if (!rc || rc.status !== 1) {
    throw new Error(`mineRequestToDestination: mine tx failed (${tx.hash})`);
  }
  log(`self-mine mined ${tx.hash}`);
  return tx.hash;
}
