/**
 * @title Coti Pod Crypto
 * This library provides helper methods to encrypt / decrypt data for PoD dApps.
 * Encrypt uses the PoD encryption service; decrypt uses @coti-io/coti-sdk-typescript.
 */

import { decryptUint, decryptString } from "@coti-io/coti-sdk-typescript";
import type { ctString } from "@coti-io/coti-sdk-typescript";

const ENCRYPTION_SERVICE: Record<string, string> = {
  testnet: "https://fullnode.testnet.coti.io/pod-encryption",
  mainnet: "https://pod-encryption-service-mainnet.coti.io",
};

/** Data types supported for encryption/decryption (matches Solidity IT_* / MpcDataType). */
export enum DataType {
  Bool = "bool",
  Uint8 = "uint8",
  Uint16 = "uint16",
  Uint32 = "uint32",
  Uint64 = "uint64",
  Uint128 = "uint128",
  Uint256 = "uint256",
  String = "string",
  itBool = "itBool",
  itUint8 = "itUint8",
  itUint16 = "itUint16",
  itUint32 = "itUint32",
  itUint64 = "itUint64",
  itUint128 = "itUint128",
  itUint256 = "itUint256",
  itString = "itString",
}

/** Result of encrypting a scalar (uint/bool) for use in PoD contracts. */
export type EncryptedScalar = {
  ciphertext: string | bigint;
  signature: string;
};

/** Result of encrypting a string (ciphertext is array of cells). */
export type EncryptedString = {
  ciphertext: { value: string[] };
  signature: string[];
};

/** Union of encrypted results. */
export type EncryptedValue = EncryptedScalar | EncryptedString;

/** Legacy alias for EncryptedScalar (uint64). */
export type EncryptedUint64 = EncryptedScalar;

function toServiceType(dataType: DataType): string {
  return dataType;
}

export function isEnectyptedType(dataType: DataType): boolean {
  return dataType.startsWith("it");
}

export class CotiPodCrypto {
  /**
   * Encrypt a value via the PoD encryption service.
   * @param value - Plaintext (numeric string, "true"/"false", or string for String type)
   * @param network - "testnet" or "mainnet", or full service URL
   * @param dataType - Type of the value
   */
  static async encrypt(
    value: string,
    network: "testnet" | "mainnet" | string,
    dataType: DataType = DataType.Uint64
  ): Promise<EncryptedValue> {
    const baseUrl = ENCRYPTION_SERVICE[network] ?? network;
    const url = `${baseUrl.replace(/\/$/, "")}/buildEncryptedInputs`;
    const body = { dataType: toServiceType(dataType), value };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Encryption service error: ${text}`);
    }
    const data = (await res.json()) as Record<string, unknown>;

    if (dataType === DataType.String) {
      const ct = data.ciphertext as { value?: string[] } | undefined;
      const sig = data.signature as string[] | undefined;
      if (!ct?.value || !Array.isArray(sig)) {
        throw new Error(
          "Encryption response for string missing ciphertext.value or signature array"
        );
      }
      return { ciphertext: { value: ct.value.map(String) }, signature: sig };
    }

    const ciphertext = (data.ciphertext ??
      (data as { cipherText?: string }).cipherText) as string | bigint | undefined;
    const signature = data.signature as string | undefined;
    if (ciphertext == null || signature == null) {
      throw new Error("Encryption response missing ciphertext or signature");
    }
    return { ciphertext, signature: String(signature) };
  }

  /**
   * Decrypt a ciphertext using the user's AES key.
   * @param ciphertext - For scalar types: hex string (e.g. from contract). For String: JSON of ctString or ctString object.
   */
  static decrypt(
    ciphertext: string | ctString,
    aesKey: string,
    dataType: DataType = DataType.Uint64
  ): string {
    const key = aesKey.trim();
    if (!key) throw new Error("AES key is required");

    if (dataType === DataType.String) {
      let ct: ctString | Record<string, unknown>;
      if (typeof ciphertext === "string") {
        try {
          ct = JSON.parse(ciphertext) as ctString | Record<string, unknown>;
        } catch (e: unknown) {
          const err = new Error("invalid ctString JSON");
          Object.assign(err, { cause: e });
          throw err;
        }
      } else {
        ct = ciphertext;
      }
      const value = Array.isArray(ct?.value) ? ct.value.map((c: string | bigint) => BigInt(c)) : [];
      return decryptString({ value }, key);
    }

    const raw = (typeof ciphertext === "string" ? ciphertext : "").trim();
    if (!raw || raw === "0x" || raw === "0x0") return dataType === DataType.Bool ? "false" : "0";
    const big = BigInt(raw);
    if (big === 0n) return dataType === DataType.Bool ? "false" : "0";

    const decrypted = decryptUint(big, key);
    if (dataType === DataType.Bool) return decrypted === 1n ? "true" : "false";
    return decrypted.toString();
  }
}
