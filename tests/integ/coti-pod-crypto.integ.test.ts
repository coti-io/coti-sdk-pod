/**
 * Integration tests for the PoD encryption HTTP API (`buildEncryptedInputs`) and local
 * `CotiPodCrypto.decrypt` behaviour.
 *
 * Run: `npm run test:integ` (needs network access to the encryption service for encrypt tests).
 *
 * Note: HTTP `encrypt` returns signed `it*` payloads for contracts — not the same as raw
 * `ct*` hex you pass to `CotiPodCrypto.decrypt` after onboarding/MPC. We therefore do not
 * assert encrypt→decrypt round-trip against the encryption service here.
 *
 * Optional `.env`: see `.env.example` (`POD_TEST_NETWORK`, `POD_ENCRYPTION_SERVICE_URL`, `SEPOLIA_RPC_URL`, `COTI_TESTNET_RPC_URL`).
 */

import { describe, it, expect } from "vitest";
import {
  CotiPodCrypto,
  DataType,
  type EncryptedString,
  type EncryptedScalar,
} from "@coti-io/pod-sdk";
import { initTestContext, encryptionOptionsForInteg, type TestContext } from "../test-utils.js";

const ctx: TestContext = initTestContext();
const encOpts = encryptionOptionsForInteg();

describe("PoD encryption service — plain scalar types", () => {
  const cases: { title: string; plaintext: string; dataType: DataType }[] = [
    { title: "boolean true", plaintext: "true", dataType: DataType.Bool },
    { title: "boolean false", plaintext: "false", dataType: DataType.Bool },
    { title: "uint8 max", plaintext: "255", dataType: DataType.Uint8 },
    { title: "uint16 max", plaintext: "65535", dataType: DataType.Uint16 },
    { title: "uint32 max", plaintext: "4294967295", dataType: DataType.Uint32 },
    {
      title: "uint64 max",
      plaintext: "18446744073709551615",
      dataType: DataType.Uint64,
    },
    { title: "uint128 small", plaintext: "1", dataType: DataType.Uint128 },
    { title: "uint256 small", plaintext: "1", dataType: DataType.Uint256 },
  ];

  it.each(cases)(
    "buildEncryptedInputs accepts $title and returns ciphertext + signature",
    async ({ plaintext, dataType }) => {
      const out = await CotiPodCrypto.encrypt(plaintext, ctx.network, dataType, encOpts);
      expect(out).toHaveProperty("ciphertext");
      expect(out).toHaveProperty("signature");
      const sig = (out as EncryptedScalar).signature;
      expect(typeof sig).toBe("string");
      expect(sig.length).toBeGreaterThan(0);
    }
  );

  it("defaults dataType to uint64 when omitted", async () => {
    const out = await CotiPodCrypto.encrypt("42", ctx.network, undefined, encOpts);
    expect(out).toHaveProperty("ciphertext");
    expect(out).toHaveProperty("signature");
  });
});

/**
 * `DataType.it*` is for Solidity typings. The live `buildEncryptedInputs` API expects plain
 * names (`bool`, `uint64`, …) — see the scalar table above.
 */

describe("PoD encryption service — string plaintext", () => {
  it("returns per-cell ciphertext and parallel signatures", async () => {
    const out = (await CotiPodCrypto.encrypt(
      "hello",
      ctx.network,
      DataType.String,
      encOpts
    )) as EncryptedString;
    expect(Array.isArray(out.ciphertext.value)).toBe(true);
    expect(Array.isArray(out.signature)).toBe(true);
    expect(out.signature.length).toBe(out.ciphertext.value.length);
  });

  it("accepts empty string", async () => {
    const out = (await CotiPodCrypto.encrypt(
      "",
      ctx.network,
      DataType.String,
      encOpts
    )) as EncryptedString;
    expect(Array.isArray(out.ciphertext.value)).toBe(true);
    expect(Array.isArray(out.signature)).toBe(true);
  });
});

describe("PoD encryption service — explicit base URL", () => {
  it("reaches the same host when passing full URL instead of keyword", async () => {
    const out = await CotiPodCrypto.encrypt(
      "0",
      ctx.encryptionBaseUrl,
      DataType.Uint64,
      encOpts
    );
    expect(out).toHaveProperty("ciphertext");
    expect(out).toHaveProperty("signature");
  });
});

describe("CotiPodCrypto.decrypt — local helpers (no HTTP)", () => {
  it("rejects empty AES key", () => {
    expect(() =>
      CotiPodCrypto.decrypt("0x1", "   ", DataType.Uint64)
    ).toThrow(/AES key is required/i);
  });

  it("maps all-zero uint ciphertext to 0", () => {
    const key = "0123456789abcdef0123456789abcdef";
    expect(CotiPodCrypto.decrypt("0x0", key, DataType.Uint64)).toBe("0");
  });

  it("maps all-zero bool ciphertext to false", () => {
    const key = "0123456789abcdef0123456789abcdef";
    expect(CotiPodCrypto.decrypt("0x0", key, DataType.Bool)).toBe("false");
  });

  it("rejects malformed ctString JSON with a clear error", () => {
    const key = "0123456789abcdef0123456789abcdef";
    expect(() =>
      CotiPodCrypto.decrypt("not-json{", key, DataType.String)
    ).toThrow(/invalid ctString JSON/i);
  });
});

describe("Test context — env wiring", () => {
  it("exposes encryption base URL aligned with network", () => {
    expect(ctx.encryptionBaseUrl).toMatch(/^https:\/\//);
    expect(ctx.network).toMatch(/^(testnet|mainnet)$/);
  });

  it("RPC URLs are optional (undefined when unset)", () => {
    expect(
      ctx.rpcUrl === undefined || ctx.rpcUrl.startsWith("http")
    ).toBe(true);
    expect(
      ctx.cotiTestnetRpcUrl === undefined || ctx.cotiTestnetRpcUrl.startsWith("http")
    ).toBe(true);
  });
});
