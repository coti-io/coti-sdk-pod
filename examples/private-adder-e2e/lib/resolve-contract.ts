import { execSync } from "node:child_process";
import {
  DEFAULT_PRIVATE_ADDER_SEPOLIA_ADDRESS,
  readDeployedAddresses,
  type ExampleEnv,
} from "./env";

/**
 * Resolve PrivateAdder address:
 * 1. `PRIVATE_ADDER_SEPOLIA_ADDRESS` env override
 * 2. deploy when `DEPLOY_ON_MISSING=true` (uses `deployed.json` or runs deploy)
 * 3. {@link DEFAULT_PRIVATE_ADDER_SEPOLIA_ADDRESS}
 */
export async function resolvePrivateAdderAddress(
  env: ExampleEnv
): Promise<string | null> {
  if (env.privateAdderAddress) {
    return env.privateAdderAddress;
  }

  if (env.deployOnMissing) {
    const cached = readDeployedAddresses();
    if (cached?.sepolia?.privateAdder) {
      return cached.sepolia.privateAdder;
    }

    if (!env.sepoliaRpcUrl || !env.sepoliaPrivateKey) {
      return null;
    }

    execSync("npx hardhat run scripts/deploy.ts --network sepolia", {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });

    const afterDeploy = readDeployedAddresses();
    return afterDeploy?.sepolia?.privateAdder ?? null;
  }

  return DEFAULT_PRIVATE_ADDER_SEPOLIA_ADDRESS;
}

export function canRunE2e(env: ExampleEnv, contractAddress: string | null): boolean {
  return Boolean(
    env.sepoliaRpcUrl &&
      env.cotiTestnetRpcUrl &&
      env.sepoliaPrivateKey &&
      env.accountAesKey &&
      contractAddress
  );
}
