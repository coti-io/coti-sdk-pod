/**
 * Shared integration-test setup: loads `.env` once, resolves PoD encryption network / URLs,
 * and optional JSON-RPC endpoints for chain-facing tests.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

const TESTNET_BASE = "https://fullnode.testnet.coti.io/pod-encryption";
const MAINNET_BASE = "https://pod-encryption-service-mainnet.coti.io";

/**
 * Initialise shared integration-test context (idempotent).
 *
 * See `.env.example` for variables: `POD_TEST_NETWORK`, `POD_ENCRYPTION_SERVICE_URL`,
 * `POD_TEST_RPC_URL`, `POD_COTI_TESTNET_RPC_URL`.
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

  const rpcUrl = process.env.POD_TEST_RPC_URL?.trim() || undefined;
  const cotiTestnetRpcUrl =
    process.env.POD_COTI_TESTNET_RPC_URL?.trim() || undefined;

  cachedContext = {
    network,
    encryptionBaseUrl,
    rpcUrl,
    cotiTestnetRpcUrl,
  };
  return cachedContext;
}
