import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  DataType,
  encodePodMethodArguments,
  estimateForwardDataSizeFromArguments,
  mapPodMethodArgumentsEncoded,
  applyPodTxGasLimitBuffer,
  POD_TX_GAS_LIMIT_BUFFER_BPS,
  POD_INBOX_MESSAGE_SENT_EVENT,
  EncryptionUrlNotAllowedError,
  DEFAULT_INBOX_ADDRESS,
  type PodMethodArgument,
} from "@coti-io/pod-sdk";

describe("estimateForwardDataSizeFromArguments", () => {
  it("includes a base size plus encoded string lengths", () => {
    const args: PodMethodArgument[] = [
      { type: DataType.Uint64, value: "12345", isCallBackFee: false },
      { type: DataType.String, value: "abc", isCallBackFee: false },
    ];
    const size = estimateForwardDataSizeFromArguments(args);
    expect(size).toBe(256n + 5n + 3n);
  });

  it("ignores non-string values", () => {
    const args: PodMethodArgument[] = [
      { type: DataType.Uint64, value: 42n, isCallBackFee: false },
    ];
    expect(estimateForwardDataSizeFromArguments(args)).toBe(256n);
  });
});

describe("applyPodTxGasLimitBuffer", () => {
  it("applies a +20% buffer to estimated gas (ceil)", () => {
    expect(POD_TX_GAS_LIMIT_BUFFER_BPS).toBe(12000n);
    expect(applyPodTxGasLimitBuffer(1_000_000n)).toBe(1_200_000n);
    // 10 * 1.2 = 12 exactly
    expect(applyPodTxGasLimitBuffer(10n)).toBe(12n);
    // 1 * 1.2 = 1.2 → ceil to 2
    expect(applyPodTxGasLimitBuffer(1n)).toBe(2n);
    expect(applyPodTxGasLimitBuffer(1_071_217n)).toBe(
      (1_071_217n * 12000n + 9999n) / 10000n
    );
  });

  it("leaves zero unchanged", () => {
    expect(applyPodTxGasLimitBuffer(0n)).toBe(0n);
  });
});

describe("compact MessageSent topic0", () => {
  it("matches InboxBase compact event signature", () => {
    const iface = new ethers.Interface([POD_INBOX_MESSAGE_SENT_EVENT]);
    expect(iface.getEvent("MessageSent")!.topicHash).toBe(
      "0x2e489ff6032dec69660f6781fde68ecdaf7d42d1511806cd4e0781d44488fcad"
    );
  });
});

describe("DEFAULT_INBOX_ADDRESS", () => {
  it("points at deployConfig pod.inbox.v2.2 CREATE3", () => {
    expect(DEFAULT_INBOX_ADDRESS.toLowerCase()).toBe(
      "0x3b8b70819f27e0438cbce7f31894f799da52648f"
    );
  });
});

describe("encodePodMethodArguments", () => {
  it("coerces plain uint arguments without mutating the input array", async () => {
    const args: PodMethodArgument[] = [
      { type: DataType.Uint64, value: "42", isCallBackFee: false },
      { type: DataType.Bool, value: "true", isCallBackFee: false },
    ];
    const encoded = await encodePodMethodArguments(args, "testnet", false);
    expect(encoded[0].value).toBe(42n);
    expect(encoded[1].value).toBe(true);
    expect(args[0].value).toBe("42");
    expect(args[1].value).toBe("true");
  });

  it("parses pre-encrypted it* JSON without calling the encryption service", async () => {
    const encrypted = {
      ciphertext: "123",
      signature: "0xsig",
    };
    const args: PodMethodArgument[] = [
      {
        type: DataType.itUint64,
        value: JSON.stringify(encrypted),
        isCallBackFee: false,
      },
    ];
    const encoded = await encodePodMethodArguments(args, "testnet", false);
    expect(encoded[0].value).toEqual([123n, "0xsig"]);
  });
});

describe("mapPodMethodArgumentsEncoded", () => {
  it("mutates only the array it receives, not a separate caller copy", async () => {
    const original: PodMethodArgument[] = [
      { type: DataType.Uint32, value: "7", isCallBackFee: false },
    ];
    const working = original.map((a) => ({ ...a }));
    await mapPodMethodArgumentsEncoded(working, "testnet", false);
    expect(working[0].value).toBe(7n);
    expect(original[0].value).toBe("7");
  });

  it("rejects unlisted encryption service URLs", async () => {
    const args: PodMethodArgument[] = [
      { type: DataType.Uint64, value: "1", isCallBackFee: false },
    ];
    await expect(
      mapPodMethodArgumentsEncoded(args, "https://evil.example/pod-encryption", false)
    ).rejects.toThrow(EncryptionUrlNotAllowedError);
  });

  it("rejects pre-encrypted it* JSON with invalid signatures when context is provided", async () => {
    const args: PodMethodArgument[] = [
      {
        type: DataType.itUint64,
        value: JSON.stringify({ ciphertext: "123", signature: "0xdeadbeef" }),
        isCallBackFee: false,
      },
    ];
    await expect(
      mapPodMethodArgumentsEncoded(args, "testnet", false, {
        userAddress: "0x1111111111111111111111111111111111111111",
        contractAddress: "0x2222222222222222222222222222222222222222",
        functionSelector: "0x12345678",
      })
    ).rejects.toThrow(/IT signature/i);
  });
});
