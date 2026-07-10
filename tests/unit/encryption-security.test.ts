import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  DataType,
  ENCRYPTION_SERVICE_PATHS,
  EncryptionUrlNotAllowedError,
  ItSignatureVerificationError,
  OFFICIAL_ENCRYPTION_SERVICE_URLS,
  encryptionServiceApiUrl,
  resolveEncryptionServiceBaseUrl,
  verifyItEncryptedValue,
} from "@coti-io/pod-sdk";

describe("encryptionServiceApiUrl", () => {
  it("uses kebab-case routes from pod-encryption-service", () => {
    expect(ENCRYPTION_SERVICE_PATHS.buildEncryptedInputs).toBe("/build-encrypted-inputs");
    expect(ENCRYPTION_SERVICE_PATHS.validateEncryptedData).toBe("/validate-encrypted-data");
    expect(
      encryptionServiceApiUrl(OFFICIAL_ENCRYPTION_SERVICE_URLS.testnet, "buildEncryptedInputs")
    ).toBe(`${OFFICIAL_ENCRYPTION_SERVICE_URLS.testnet}/build-encrypted-inputs`);
  });
});

describe("resolveEncryptionServiceBaseUrl", () => {
  it("accepts testnet and mainnet keywords", () => {
    expect(resolveEncryptionServiceBaseUrl("testnet")).toBe(
      OFFICIAL_ENCRYPTION_SERVICE_URLS.testnet
    );
    expect(resolveEncryptionServiceBaseUrl("mainnet")).toBe(
      OFFICIAL_ENCRYPTION_SERVICE_URLS.mainnet
    );
  });

  it("accepts official full URLs", () => {
    expect(
      resolveEncryptionServiceBaseUrl(OFFICIAL_ENCRYPTION_SERVICE_URLS.testnet)
    ).toBe(OFFICIAL_ENCRYPTION_SERVICE_URLS.testnet);
  });

  it("rejects unknown URLs by default", () => {
    expect(() =>
      resolveEncryptionServiceBaseUrl("https://evil.example/pod-encryption")
    ).toThrow(EncryptionUrlNotAllowedError);
  });

  it("accepts trusted custom URLs", () => {
    const custom = "https://staging.example/pod-encryption";
    expect(
      resolveEncryptionServiceBaseUrl(custom, {
        trustedEncryptionServiceUrls: [custom],
      })
    ).toBe(custom);
  });

  it("accepts any HTTPS URL when allowUnlistedEncryptionUrl is set", () => {
    const custom = "https://dev.example/pod-encryption";
    expect(
      resolveEncryptionServiceBaseUrl(custom, { allowUnlistedEncryptionUrl: true })
    ).toBe(custom);
  });
});

describe("verifyItEncryptedValue", () => {
  const wallet = ethers.Wallet.createRandom();
  const contractAddress = "0x1111111111111111111111111111111111111111";
  const functionSelector = "0xdeadbeef";

  function signScalarIt(ciphertext: bigint): string {
    const digest = ethers.solidityPackedKeccak256(
      ["address", "address", "bytes4", "uint256"],
      [wallet.address, contractAddress, functionSelector, ciphertext]
    );
    return ethers.Signature.from(new ethers.SigningKey(wallet.privateKey).sign(digest))
      .serialized;
  }

  it("accepts a valid scalar IT signature", () => {
    const ciphertext = 42n;
    verifyItEncryptedValue(
      DataType.itUint64,
      { ciphertext, signature: signScalarIt(ciphertext) },
      {
        userAddress: wallet.address,
        contractAddress,
        functionSelector,
      }
    );
  });

  it("rejects an invalid scalar IT signature", () => {
    expect(() =>
      verifyItEncryptedValue(
        DataType.itUint64,
        { ciphertext: 42n, signature: signScalarIt(99n) },
        {
          userAddress: wallet.address,
          contractAddress,
          functionSelector,
        }
      )
    ).toThrow(ItSignatureVerificationError);
  });
});
