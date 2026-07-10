/**
 * Encryption service URL allowlisting and client-side IT signature verification.
 */

import { ethers } from "ethers";
import {
  DataType,
  type EncryptedScalar,
  type EncryptedString,
  type EncryptedValue,
  type EncryptContext,
} from "./coti-pod-crypto.js";
import { EncryptionUrlNotAllowedError, ItSignatureVerificationError } from "./errors.js";

const CT_SIZE = 32;

/** Official PoD encryption service base URLs (no trailing slash). */
export const OFFICIAL_ENCRYPTION_SERVICE_URLS = {
  testnet: "https://fullnode.testnet.coti.io/pod-encryption",
  mainnet: "https://pod-encryption-service-mainnet.coti.io",
} as const;

/**
 * HTTP routes on the PoD encryption service (kebab-case; see pod-encryption-service).
 * @see https://github.com/cotitech-io/pod-encryption-service
 */
export const ENCRYPTION_SERVICE_PATHS = {
  buildEncryptedInputs: "/build-encrypted-inputs",
  validateEncryptedData: "/validate-encrypted-data",
  health: "/health",
} as const;

export type EncryptionServicePath = keyof typeof ENCRYPTION_SERVICE_PATHS;

const OFFICIAL_URL_SET = new Set(
  Object.values(OFFICIAL_ENCRYPTION_SERVICE_URLS).map(normalizeEncryptionServiceUrl)
);

export interface EncryptionServiceSecurityOptions {
  /** Extra base URLs permitted besides the official testnet/mainnet endpoints. */
  trustedEncryptionServiceUrls?: string[];
  /**
   * When true, any HTTPS URL (or local HTTP) may be used. Not recommended for production.
   */
  allowUnlistedEncryptionUrl?: boolean;
}

export interface ItVerificationOptions {
  /**
   * Verify user-signed IT payloads parsed from JSON before contract calls (default
   * true when {@link EncryptContext} is complete). Does not apply to ciphertext
   * returned by the HTTP encryption service — those signatures use the service key.
   */
  verifyItSignature?: boolean;
}

/** Strip a trailing slash for stable URL comparison. */
export function normalizeEncryptionServiceUrl(url: string): string {
  return url.replace(/\/$/, "");
}

/** Build a full encryption-service API URL from a resolved base URL and route name. */
export function encryptionServiceApiUrl(
  baseUrl: string,
  route: EncryptionServicePath
): string {
  return `${normalizeEncryptionServiceUrl(baseUrl)}${ENCRYPTION_SERVICE_PATHS[route]}`;
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function assertAllowedEncryptionProtocol(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EncryptionUrlNotAllowedError(url, "invalid URL");
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:" && isLocalDevHost(parsed.hostname)) return;
  throw new EncryptionUrlNotAllowedError(
    url,
    "encryption service URL must use HTTPS (HTTP is allowed only for localhost)"
  );
}

/**
 * Resolve `network` to an allowed encryption service base URL.
 *
 * Accepts `"testnet"`, `"mainnet"`, an official full URL, or URLs listed in
 * `trustedEncryptionServiceUrls`. Rejects unknown hosts unless
 * `allowUnlistedEncryptionUrl` is set.
 */
export function resolveEncryptionServiceBaseUrl(
  network: "testnet" | "mainnet" | string,
  options?: EncryptionServiceSecurityOptions
): string {
  const resolved =
    network in OFFICIAL_ENCRYPTION_SERVICE_URLS
      ? OFFICIAL_ENCRYPTION_SERVICE_URLS[network as keyof typeof OFFICIAL_ENCRYPTION_SERVICE_URLS]
      : network;

  const normalized = normalizeEncryptionServiceUrl(resolved);

  if (network in OFFICIAL_ENCRYPTION_SERVICE_URLS || OFFICIAL_URL_SET.has(normalized)) {
    return normalized;
  }

  const trusted = new Set(
    (options?.trustedEncryptionServiceUrls ?? []).map(normalizeEncryptionServiceUrl)
  );
  if (trusted.has(normalized)) {
    assertAllowedEncryptionProtocol(normalized);
    return normalized;
  }

  if (options?.allowUnlistedEncryptionUrl) {
    assertAllowedEncryptionProtocol(normalized);
    return normalized;
  }

  throw new EncryptionUrlNotAllowedError(normalized);
}

/** Whether all fields required for IT signature verification are present. */
export function hasCompleteEncryptContext(
  context?: EncryptContext
): context is Required<EncryptContext> {
  return !!(
    context?.userAddress &&
    context?.contractAddress &&
    context?.functionSelector
  );
}

function toCtBigInt(raw: string | bigint): bigint {
  if (typeof raw === "bigint") return raw;
  return BigInt(String(raw).trim());
}

function ctUintToBytes(ciphertext: bigint): Uint8Array {
  const bytes = new Uint8Array(CT_SIZE);
  let value = ciphertext;
  for (let i = CT_SIZE - 1; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

function ctUint256ToBytes(high: bigint, low: bigint): Uint8Array {
  return new Uint8Array([...ctUintToBytes(high), ...ctUintToBytes(low)]);
}

function assertRecoveredSigner(
  digest: string,
  signature: string,
  expectedSigner: string
): void {
  let recovered: string;
  try {
    recovered = ethers.recoverAddress(digest, signature);
  } catch (e: unknown) {
    throw new ItSignatureVerificationError("invalid IT signature encoding", {
      cause: e,
    });
  }
  if (recovered.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new ItSignatureVerificationError(
      `IT signature signer mismatch: expected ${expectedSigner}, recovered ${recovered}`
    );
  }
}

function verifyScalarItSignature(
  userAddress: string,
  contractAddress: string,
  functionSelector: string,
  ciphertext: bigint,
  signature: string
): void {
  const digest = ethers.solidityPackedKeccak256(
    ["address", "address", "bytes4", "uint256"],
    [userAddress, contractAddress, functionSelector, ciphertext]
  );
  assertRecoveredSigner(digest, signature, userAddress);
}

function verifyItUint256Signature(
  userAddress: string,
  contractAddress: string,
  functionSelector: string,
  ciphertextHigh: bigint,
  ciphertextLow: bigint,
  signature: string
): void {
  const ctBytes = ctUint256ToBytes(ciphertextHigh, ciphertextLow);
  const digest = ethers.solidityPackedKeccak256(
    ["bytes", "bytes", "bytes4", "bytes"],
    [
      ethers.getBytes(userAddress),
      ethers.getBytes(contractAddress),
      ethers.getBytes(functionSelector),
      ctBytes,
    ]
  );
  assertRecoveredSigner(digest, signature, userAddress);
}

/**
 * Verify that client-side IT JSON was signed by `context.userAddress` for the
 * target contract call (e.g. from `buildInputText`). Not used for HTTP
 * `build-encrypted-inputs` responses, which are signed by the encryption service.
 */
export function verifyItEncryptedValue(
  dataType: DataType,
  encrypted: EncryptedValue,
  context: Required<EncryptContext>
): void {
  const { userAddress, contractAddress, functionSelector } = context;

  if (dataType === DataType.itString) {
    const s = encrypted as EncryptedString;
    if (s.ciphertext.value.length !== s.signature.length) {
      throw new ItSignatureVerificationError(
        "itString ciphertext cell count does not match signature count"
      );
    }
    for (let i = 0; i < s.ciphertext.value.length; i++) {
      verifyScalarItSignature(
        userAddress,
        contractAddress,
        functionSelector,
        toCtBigInt(s.ciphertext.value[i]!),
        s.signature[i]!
      );
    }
    return;
  }

  const scalar = encrypted as EncryptedScalar;
  const ct = scalar.ciphertext;
  if (
    ct &&
    typeof ct === "object" &&
    "ciphertextHigh" in ct &&
    "ciphertextLow" in ct
  ) {
    const limbs = ct as { ciphertextHigh: string | bigint; ciphertextLow: string | bigint };
    verifyItUint256Signature(
      userAddress,
      contractAddress,
      functionSelector,
      toCtBigInt(limbs.ciphertextHigh),
      toCtBigInt(limbs.ciphertextLow),
      scalar.signature
    );
    return;
  }

  verifyScalarItSignature(
    userAddress,
    contractAddress,
    functionSelector,
    toCtBigInt(ct as string | bigint),
    scalar.signature
  );
}

export function shouldVerifyItSignature(
  context: EncryptContext | undefined,
  options?: ItVerificationOptions
): context is Required<EncryptContext> {
  if (options?.verifyItSignature === false) return false;
  return hasCompleteEncryptContext(context);
}
