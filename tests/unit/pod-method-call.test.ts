import { describe, it, expect } from "vitest";
import {
  DataType,
  encodePodMethodArguments,
  estimateForwardDataSizeFromArguments,
  mapPodMethodArgumentsEncoded,
  type PodMethodArgument,
} from "@coti/pod-sdk";

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
    expect(encoded[0].value).toEqual({
      ciphertext: 123n,
      signature: "0xsig",
    });
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
});
