import { describe, it, expect } from "vitest";
import {
  DataType,
  isEncryptedType,
  toPlainServiceType,
  CotiPodCrypto,
} from "@coti/pod-sdk";

describe("isEncryptedType", () => {
  it("returns true for it* Solidity types", () => {
    expect(isEncryptedType(DataType.itUint64)).toBe(true);
    expect(isEncryptedType(DataType.itString)).toBe(true);
  });

  it("returns false for plain types", () => {
    expect(isEncryptedType(DataType.Uint64)).toBe(false);
    expect(isEncryptedType(DataType.String)).toBe(false);
  });
});

describe("toPlainServiceType", () => {
  it("maps it* names to encryption-service plain names", () => {
    expect(toPlainServiceType(DataType.itUint64)).toBe("uint64");
    expect(toPlainServiceType(DataType.itBool)).toBe("bool");
    expect(toPlainServiceType(DataType.itString)).toBe("string");
  });

  it("passes plain names through unchanged", () => {
    expect(toPlainServiceType(DataType.Uint64)).toBe("uint64");
    expect(toPlainServiceType(DataType.Bool)).toBe("bool");
  });
});

describe("CotiPodCrypto.decrypt", () => {
  const key = "0123456789abcdef0123456789abcdef";

  it("accepts itUint64 the same as Uint64 for zero ciphertext", () => {
    expect(CotiPodCrypto.decrypt("0x0", key, DataType.itUint64)).toBe("0");
    expect(CotiPodCrypto.decrypt("0x0", key, DataType.Uint64)).toBe("0");
  });

  it("accepts itBool the same as Bool for zero ciphertext", () => {
    expect(CotiPodCrypto.decrypt("0x0", key, DataType.itBool)).toBe("false");
    expect(CotiPodCrypto.decrypt("0x0", key, DataType.Bool)).toBe("false");
  });
});
