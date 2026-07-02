import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const EXAMPLE_ROOT = process.cwd();

let dotenvLoaded = false;

function loadDotEnv(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  const envPath = join(EXAMPLE_ROOT, ".env");
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

export type ExampleEnv = {
  sepoliaRpcUrl: string | undefined;
  cotiTestnetRpcUrl: string | undefined;
  sepoliaPrivateKey: string | undefined;
  accountAesKey: string | undefined;
  privateAdderAddress: string | undefined;
  encryptionNetwork: "testnet" | "mainnet";
  deployOnMissing: boolean;
  pollIntervalMs: number;
  pollTimeoutMs: number;
};

export function getExampleRoot(): string {
  return EXAMPLE_ROOT;
}

function normalizePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const trimmed = key.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

export function loadEnv(): ExampleEnv {
  loadDotEnv();

  const rawNet = (process.env.POD_ENCRYPTION_NETWORK || "testnet").toLowerCase();
  const encryptionNetwork: "testnet" | "mainnet" =
    rawNet === "mainnet" ? "mainnet" : "testnet";

  const deployOnMissing =
    (process.env.DEPLOY_ON_MISSING ?? "true").toLowerCase() !== "false";

  const sepoliaPrivateKey = normalizePrivateKey(
    process.env.SEPOLIA_PRIVATE_KEY || process.env.PRIVATE_KEY_ACCOUNT_2
  );
  const accountAesKey =
    process.env.POD_ACCOUNT_AES_KEY?.trim() ||
    process.env.USER_AES_KEY_2?.trim() ||
    undefined;

  return {
    sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL?.trim() || undefined,
    cotiTestnetRpcUrl: process.env.COTI_TESTNET_RPC_URL?.trim() || undefined,
    sepoliaPrivateKey,
    accountAesKey,
    privateAdderAddress:
      process.env.PRIVATE_ADDER_SEPOLIA_ADDRESS?.trim() || undefined,
    encryptionNetwork,
    deployOnMissing,
    pollIntervalMs: Number(process.env.POD_E2E_POLL_INTERVAL_MS || 5000),
    pollTimeoutMs: Number(process.env.POD_E2E_TIMEOUT_MS || 300_000),
  };
}

export function hasRequiredE2eEnv(env: ExampleEnv): boolean {
  return Boolean(
    env.sepoliaRpcUrl &&
      env.cotiTestnetRpcUrl &&
      env.sepoliaPrivateKey &&
      env.accountAesKey
  );
}

export type DeployedAddresses = {
  sepolia: {
    privateAdder: string;
    deployedAt?: string;
  };
};

export function readDeployedAddresses(): DeployedAddresses | null {
  const path = join(EXAMPLE_ROOT, "deployed.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DeployedAddresses;
  } catch {
    return null;
  }
}

export function writeDeployedAddresses(data: DeployedAddresses): void {
  const path = join(EXAMPLE_ROOT, "deployed.json");
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  persistPrivateAdderAddressInDotEnv(data.sepolia.privateAdder);
}

/** Keep deployed contract address in .env for reuse across runs. */
export function persistPrivateAdderAddressInDotEnv(address: string): void {
  const envPath = join(EXAMPLE_ROOT, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  const line = `PRIVATE_ADDER_SEPOLIA_ADDRESS=${address}`;
  const updated = content.match(/^PRIVATE_ADDER_SEPOLIA_ADDRESS=/m)
    ? content.replace(/^PRIVATE_ADDER_SEPOLIA_ADDRESS=.*$/m, line)
    : `${content.replace(/\n?$/, "\n")}${line}\n`;
  writeFileSync(envPath, updated, "utf8");
  process.env.PRIVATE_ADDER_SEPOLIA_ADDRESS = address;
}
