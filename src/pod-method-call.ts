/**
 * PoD app calls: optional encryption (`encryptAndCallMethod` vs `callMethod`), inbox fee estimate, `MessageSent` parsing.
 */

import { ethers } from "ethers";
import {
  CotiPodCrypto,
  DataType,
  type EncryptedString,
  type EncryptedValue,
  isEncryptedType,
} from "./coti-pod-crypto.js";
import { DEFAULT_INBOX_ADDRESS_BY_CHAIN_ID } from "./consts.js";
import type { PodSdkConfig } from "./config.js";
import { FeeEstimationError, InboxConfigError } from "./errors.js";

export interface PodMethodArgument {
  type: DataType;
  /** String before mapping (plaintext, JSON ciphertext for `it*`, etc.); after mapping, ethers-ready value. */
  value: string | unknown;
  isCallBackFee: boolean;
}

export interface PodFeeEstimate {
  totalFee: bigint;
  remoteFee: bigint;
  callBackFee: bigint;
}

export interface PodFeeEstimationConfig {
  forwardDataSize?: bigint;
  forwardGasLimit: bigint;
  gasPrice: bigint;
  callBackGasLimit?: bigint;
  callBackDataSize?: bigint;
}

export interface PodContractOptions {
  /**
   * Shared SDK config. When provided, the connected chain's `inboxAddress` and
   * `encryptionNetwork` come from here (unless overridden below).
   */
  config?: PodSdkConfig;
  /** Override inbox address for the connected chain (wins over `config`). */
  inboxAddress?: string;
  /** Override encryption network (wins over `config.encryptionNetwork`). */
  encryptionNetwork?: "testnet" | "mainnet" | string;
}

const FEE_FN =
  "function calculateTwoWayFeeRequiredInLocalToken(uint256,uint256,uint256,uint256,uint256) view returns (uint256,uint256)";
const MSG_SENT =
  "event MessageSent(bytes32 indexed requestId,uint256 indexed targetChainId,address indexed targetContract,bytes4 methodSelector,bytes32 methodCallHash,uint256 dataLength,uint16 datatypeCount,uint16 datalenCount,bytes4 callbackSelector,bytes4 errorSelector)";

function providerFromRunner(r: ethers.ContractRunner): ethers.Provider {
  if (typeof (r as ethers.Provider).getTransactionReceipt === "function") return r as ethers.Provider;
  const p = (r as ethers.Signer).provider;
  if (!p) throw new Error("PodContract: need Provider or Signer with .provider");
  return p;
}

function clonePodMethodArguments(args: PodMethodArgument[]): PodMethodArgument[] {
  return args.map((a) => ({ type: a.type, value: a.value, isCallBackFee: a.isCallBackFee }));
}

function toCt(raw: string | bigint): bigint {
  if (typeof raw === "bigint") return raw;
  const s = String(raw).trim();
  if (!s) throw new Error("empty ciphertext");
  return BigInt(s);
}

function itTuple(t: DataType, enc: EncryptedValue): Record<string, unknown> {
  if (t === DataType.itString) {
    const s = enc as EncryptedString;
    return {
      ciphertext: { value: s.ciphertext.value.map((c) => toCt(c)) },
      signature: s.signature,
    };
  }
  const e = enc as { ciphertext: string | bigint; signature: string };
  return { ciphertext: toCt(e.ciphertext), signature: e.signature };
}

function parseItJson(s: string): EncryptedValue {
  try {
    const o = JSON.parse(s) as EncryptedValue;
    if (o && typeof o === "object") return o;
  } catch {
    /* fall through */
  }
  throw new Error("callMethod: it* value must be JSON ciphertext from the user");
}

function plainCoerce(t: DataType, v: string): unknown {
  if (t === DataType.Bool) return v === "true" || v === "1";
  if (
    t === DataType.Uint8 ||
    t === DataType.Uint16 ||
    t === DataType.Uint32 ||
    t === DataType.Uint64 ||
    t === DataType.Uint128 ||
    t === DataType.Uint256
  ) {
    return BigInt(v.trim() || "0");
  }
  if (t === DataType.String) return v;
  throw new Error(`unsupported plain type: ${t}`);
}

async function resolveArg(
  arg: PodMethodArgument,
  net: string,
  encrypt: boolean
): Promise<unknown> {
  if (typeof arg.value !== "string") {
    throw new Error("argument value must be a string before resolve");
  }
  const { type, value } = arg;
  if (!isEncryptedType(type)) return plainCoerce(type, value);
  if (encrypt) return itTuple(type, await CotiPodCrypto.encrypt(value, net, type));
  return itTuple(type, parseItJson(value));
}

export function estimateForwardDataSizeFromArguments(args: PodMethodArgument[]): bigint {
  const te = new TextEncoder();
  let n = 256n;
  for (const a of args) {
    if (typeof a.value === "string") n += BigInt(te.encode(a.value).length);
  }
  return n;
}

export async function mapPodMethodArgumentsEncoded(
  args: PodMethodArgument[],
  encryptionNetwork: string,
  encrypt: boolean
): Promise<void> {
  for (const a of args) {
    a.value = await resolveArg(a, encryptionNetwork, encrypt);
  }
}

export async function encodePodMethodArguments(
  args: PodMethodArgument[],
  encryptionNetwork: string,
  encrypt: boolean
): Promise<PodMethodArgument[]> {
  const copy = clonePodMethodArguments(args);
  await mapPodMethodArgumentsEncoded(copy, encryptionNetwork, encrypt);
  return copy;
}

export class PodContract {
  readonly contract: ethers.Contract;
  private readonly inboxOverride?: string;
  private readonly net: string;
  private readonly _provider: ethers.Provider;
  private readonly config?: PodSdkConfig;

  constructor(addr: string, abi: ethers.InterfaceAbi, runner: ethers.ContractRunner, opt?: PodContractOptions) {
    this.contract = new ethers.Contract(addr, abi, runner);
    this.config = opt?.config;
    this.inboxOverride = opt?.inboxAddress;
    this.net = opt?.encryptionNetwork ?? this.config?.encryptionNetwork ?? "testnet";
    this._provider = providerFromRunner(runner);
  }

  private async inboxAddr(): Promise<string> {
    if (this.inboxOverride) return this.inboxOverride;
    const id = (await this._provider.getNetwork()).chainId.toString();
    const fromConfig = this.config?.chains.find((c) => String(c.chainId) === id)?.inboxAddress;
    if (fromConfig) return fromConfig;
    const a = DEFAULT_INBOX_ADDRESS_BY_CHAIN_ID[id];
    if (!a) {
      throw new InboxConfigError(
        id,
        `no default inbox for chain ${id}; set inboxAddress or config.chains`
      );
    }
    return a;
  }

  encryptAndCallMethod(
    method: string,
    args: PodMethodArgument[],
    feeCfg: PodFeeEstimationConfig
  ): Promise<ethers.ContractTransactionResponse> {
    return this.send(method, args, feeCfg, true);
  }

  callMethod(
    method: string,
    args: PodMethodArgument[],
    feeCfg: PodFeeEstimationConfig
  ): Promise<ethers.ContractTransactionResponse> {
    return this.send(method, args, feeCfg, false);
  }

  private async send(
    method: string,
    src: PodMethodArgument[],
    feeCfg: PodFeeEstimationConfig,
    encrypt: boolean
  ): Promise<ethers.ContractTransactionResponse> {
    const args = clonePodMethodArguments(src);
    for (const a of args) {
      if (typeof a.value !== "string") {
        throw new Error("values must be strings until encoded");
      }
    }

    const fn = this.contract.getFunction(method);
    if (args.length !== fn.fragment.inputs.length) {
      throw new Error(`${method}: expected ${fn.fragment.inputs.length} args, got ${args.length}`);
    }

    const fee = await this.estimateFee(method, args, feeCfg);
    if (args.filter((a) => a.isCallBackFee).length > 1) {
      throw new Error("at most one isCallBackFee");
    }
    const cb = args.findIndex((a) => a.isCallBackFee);

    await mapPodMethodArgumentsEncoded(args, this.net, encrypt);
    if (cb !== -1) args[cb].value = fee.callBackFee;

    const vals = args.map((a) => a.value);
    if (!fn.fragment.payable && fee.totalFee !== 0n) {
      throw new Error(`${method} is not payable but totalFee is ${fee.totalFee}`);
    }
    return fn(...vals, fn.fragment.payable ? { value: fee.totalFee } : {});
  }

  async estimateFee(
    method: string,
    podArgs: PodMethodArgument[],
    c: PodFeeEstimationConfig
  ): Promise<PodFeeEstimate> {
    if (c.forwardGasLimit === undefined || c.gasPrice === undefined) {
      throw new FeeEstimationError("forwardGasLimit and gasPrice are required");
    }
    const g = c.callBackGasLimit !== undefined;
    const d = c.callBackDataSize !== undefined;
    if (g !== d) {
      throw new FeeEstimationError(
        "callBackGasLimit and callBackDataSize must both be set or both omitted"
      );
    }

    const inbox = new ethers.Contract(await this.inboxAddr(), [FEE_FN], this._provider);
    const fn = this.contract.getFunction(method);
    if (podArgs.length !== fn.fragment.inputs.length) {
      throw new FeeEstimationError(
        `${method}: arg count ${podArgs.length} !== ${fn.fragment.inputs.length}`
      );
    }

    const fwd = c.forwardDataSize ?? estimateForwardDataSizeFromArguments(podArgs);
    const [remote, callback] = (await inbox.calculateTwoWayFeeRequiredInLocalToken(
      fwd,
      g ? c.callBackDataSize! : 0n,
      c.forwardGasLimit,
      g ? c.callBackGasLimit! : 0n,
      c.gasPrice
    )) as [bigint, bigint];

    return { totalFee: remote + callback, remoteFee: remote, callBackFee: callback };
  }

  async extractRequestIds(txHash: string): Promise<string[]> {
    const rc = await this._provider.getTransactionReceipt(txHash);
    if (!rc) throw new Error(`no receipt: ${txHash}`);
    const want = (await this.inboxAddr()).toLowerCase();
    const iface = new ethers.Interface([MSG_SENT]);
    const topic0 = iface.getEvent("MessageSent")!.topicHash;
    const out: string[] = [];
    for (const log of rc.logs) {
      if (log.address.toLowerCase() !== want) continue;
      if (log.topics[0] !== topic0) continue;
      // requestId is the first indexed field (topics[1]) on compact MessageSent events.
      if (log.topics[1]) {
        out.push(ethers.hexlify(log.topics[1]));
        continue;
      }
      try {
        const p = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (p?.name === "MessageSent") out.push(ethers.hexlify(p.args.requestId as ethers.BytesLike));
      } catch {
        /* ignore */
      }
    }
    return out;
  }
}
