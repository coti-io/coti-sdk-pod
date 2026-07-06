import { ethers } from "ethers";
import { buildInputText } from "@coti-io/coti-sdk-typescript";
import { DataType, type PodMethodArgument } from "@coti-io/pod-sdk";

const ADD_SELECTOR = new ethers.Interface([
  "function add((uint256,bytes),(uint256,bytes),uint256) payable returns (bytes32)",
]).getFunction("add")!.selector;

function itUint64Json(
  ciphertext: bigint,
  signature: Uint8Array | string
): string {
  const sig =
    typeof signature === "string"
      ? signature
      : ethers.hexlify(signature);
  return JSON.stringify({
    ciphertext: ciphertext.toString(),
    signature: sig,
  });
}

/** Build signed itUint64 args for `add` using the account AES key (not HTTP encryption). */
export function buildSignedAddArgs(
  contractAddress: string,
  wallet: ethers.Wallet,
  userAesKey: string,
  plainA: string,
  plainB: string
): PodMethodArgument[] {
  const sender = { wallet, userKey: userAesKey };
  const itA = buildInputText(
    BigInt(plainA),
    sender,
    contractAddress,
    ADD_SELECTOR
  );
  const itB = buildInputText(
    BigInt(plainB),
    sender,
    contractAddress,
    ADD_SELECTOR
  );

  return [
    {
      type: DataType.itUint64,
      value: itUint64Json(itA.ciphertext, itA.signature),
      isCallBackFee: false,
    },
    {
      type: DataType.itUint64,
      value: itUint64Json(itB.ciphertext, itB.signature),
      isCallBackFee: false,
    },
    { type: DataType.Uint256, value: "0", isCallBackFee: true },
  ];
}
