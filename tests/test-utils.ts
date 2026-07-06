/**
 * Shared integration-test setup: loads `.env` once, resolves PoD encryption network / URLs,
 * and optional JSON-RPC endpoints for chain-facing tests.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  OFFICIAL_ENCRYPTION_SERVICE_URLS,
  normalizeEncryptionServiceUrl,
  type EncryptOptions,
} from "@coti/pod-sdk";

let dotenvLoaded = false;
let cachedContext: TestContext | null = null;

function loadDotEnvFromRepoRoot(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

export type TestContext = {
  network: "testnet" | "mainnet";
  encryptionBaseUrl: string;
  rpcUrl: string | undefined;
  cotiTestnetRpcUrl: string | undefined;
};

const TESTNET_BASE = OFFICIAL_ENCRYPTION_SERVICE_URLS.testnet;
const MAINNET_BASE = OFFICIAL_ENCRYPTION_SERVICE_URLS.mainnet;

/**
 * Initialise shared integration-test context (idempotent).
 *
 * See `.env.example` for variables: `POD_TEST_NETWORK`, `POD_ENCRYPTION_SERVICE_URL`,
 * `SEPOLIA_RPC_URL`, `COTI_TESTNET_RPC_URL` (same names as the GitHub `integration` environment).
 */
export function initTestContext(): TestContext {
  if (cachedContext) return cachedContext;
  loadDotEnvFromRepoRoot();

  const rawNet = (process.env.POD_TEST_NETWORK || "testnet").toLowerCase();
  const network: "testnet" | "mainnet" =
    rawNet === "mainnet" ? "mainnet" : "testnet";

  const encryptionBaseUrl = (
    process.env.POD_ENCRYPTION_SERVICE_URL ||
    (network === "mainnet" ? MAINNET_BASE : TESTNET_BASE)
  ).replace(/\/$/, "");

  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim() || undefined;
  const cotiTestnetRpcUrl = process.env.COTI_TESTNET_RPC_URL?.trim() || undefined;

  cachedContext = {
    network,
    encryptionBaseUrl,
    rpcUrl,
    cotiTestnetRpcUrl,
  };
  return cachedContext;
}

/** Security options for live encryption HTTP tests (trusts env override URL when set). */
export function encryptionOptionsForInteg(): Pick<
  EncryptOptions,
  "trustedEncryptionServiceUrls"
> {
  const ctx = initTestContext();
  const envOverride = process.env.POD_ENCRYPTION_SERVICE_URL?.trim();
  if (!envOverride) return {};
  const normalized = normalizeEncryptionServiceUrl(ctx.encryptionBaseUrl);
  const official = new Set(
    Object.values(OFFICIAL_ENCRYPTION_SERVICE_URLS).map(normalizeEncryptionServiceUrl)
  );
  if (official.has(normalized)) return {};
  return { trustedEncryptionServiceUrls: [normalized] };
}
