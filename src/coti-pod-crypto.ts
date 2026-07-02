/**
 * @title Coti Pod Crypto
 * This library provides helper methods to encrypt / decrypt data for PoD dApps.
 * Encrypt uses the PoD encryption service; decrypt uses @coti-io/coti-sdk-typescript.
 */

import { decryptUint, decryptString } from "@coti-io/coti-sdk-typescript";
import type { ctString } from "@coti-io/coti-sdk-typescript";
import { EncryptionServiceError } from "./errors.js";

const ENCRYPTION_SERVICE: Record<string, string> = {
  testnet: "https://fullnode.testnet.coti.io/pod-encryption",
  mainnet: "https://pod-encryption-service-mainnet.coti.io",
};

const DEFAULT_ENCRYPT_TIMEOUT_MS = 30_000;

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

export interface EncryptOptions {
  /** Abort the HTTP request when the signal is aborted. */
  signal?: AbortSignal;
  /** Request timeout in milliseconds (default 30_000). */
  timeoutMs?: number;
}

/** Whether the Solidity-side type is an encrypted input (`it*`). */
export function isEncryptedType(dataType: DataType): boolean {
  return dataType.startsWith("it");
}

/**
 * @deprecated Use {@link isEncryptedType}. Kept for backward compatibility.
 */
export const isEnectyptedType = isEncryptedType;

/** Map Solidity `it*` names to plain names expected by the encryption HTTP API. */
export function toPlainServiceType(dataType: DataType): string {
  if (!isEncryptedType(dataType)) return dataType;
  if (dataType === DataType.itString) return DataType.String;
  if (dataType === DataType.itBool) return DataType.Bool;
  return dataType.slice(2).toLowerCase();
}

function mergeAbortSignals(
  signal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
    },
  };
}

export class CotiPodCrypto {
  /**
   * Encrypt a value via the PoD encryption service.
   * @param value - Plaintext (numeric string, "true"/"false", or string for String type)
   * @param network - "testnet" or "mainnet", or full service URL
   * @param dataType - Type of the value (`it*` types are normalized for the HTTP API)
   */
  static async encrypt(
    value: string,
    network: "testnet" | "mainnet" | string,
    dataType: DataType = DataType.Uint64,
    options?: EncryptOptions
  ): Promise<EncryptedValue> {
    const baseUrl = ENCRYPTION_SERVICE[network] ?? network;
    const url = `${baseUrl.replace(/\/$/, "")}/buildEncryptedInputs`;
    const body = { dataType: toPlainServiceType(dataType), value };
    const timeoutMs = options?.timeoutMs ?? DEFAULT_ENCRYPT_TIMEOUT_MS;
    const { signal, cleanup } = mergeAbortSignals(options?.signal, timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e: unknown) {
      cleanup();
      if (e instanceof Error && e.name === "AbortError") {
        throw new EncryptionServiceError(
          `encryption request timed out after ${timeoutMs}ms`,
          { cause: e }
        );
      }
      throw new EncryptionServiceError("encryption request failed", { cause: e });
    } finally {
      cleanup();
    }

    if (!res.ok) {
      const text = await res.text();
      throw new EncryptionServiceError(`encryption service error: ${text}`, {
        status: res.status,
        responseBody: text,
      });
    }

    const data = (await res.json()) as Record<string, unknown>;
    const plainType = toPlainServiceType(dataType);

    if (plainType === DataType.String) {
      const ct = data.ciphertext as { value?: string[] } | undefined;
      const sig = data.signature as string[] | undefined;
      if (!ct?.value || !Array.isArray(sig)) {
        throw new EncryptionServiceError(
          "encryption response for string missing ciphertext.value or signature array"
        );
      }
      return { ciphertext: { value: ct.value.map(String) }, signature: sig };
    }

    const ciphertext = (data.ciphertext ??
      (data as { cipherText?: string }).cipherText) as string | bigint | undefined;
    const signature = data.signature as string | undefined;
    if (ciphertext == null || signature == null) {
      throw new EncryptionServiceError(
        "encryption response missing ciphertext or signature"
      );
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

    if (dataType === DataType.String || dataType === DataType.itString) {
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
    if (!raw || raw === "0x" || raw === "0x0") {
      return dataType === DataType.Bool || dataType === DataType.itBool ? "false" : "0";
    }
    const big = BigInt(raw);
    if (big === 0n) {
      return dataType === DataType.Bool || dataType === DataType.itBool ? "false" : "0";
    }

    const decrypted = decryptUint(big, key);
    if (dataType === DataType.Bool || dataType === DataType.itBool) {
      return decrypted === 1n ? "true" : "false";
    }
    return decrypted.toString();
  }
}
