import { execSync } from "node:child_process";
import {
  readDeployedAddresses,
  type ExampleEnv,
} from "./env";

/**
 * Resolve PrivateAdder address: env override → deployed.json → deploy-if-missing.
 */
export async function resolvePrivateAdderAddress(
  env: ExampleEnv
): Promise<string | null> {
  if (env.privateAdderAddress) {
    return env.privateAdderAddress;
  }

  const cached = readDeployedAddresses();
  if (cached?.sepolia?.privateAdder) {
    return cached.sepolia.privateAdder;
  }

  if (!env.deployOnMissing) {
    return null;
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

export function canRunE2e(env: ExampleEnv, contractAddress: string | null): boolean {
  return Boolean(
    env.sepoliaRpcUrl &&
      env.cotiTestnetRpcUrl &&
      env.sepoliaPrivateKey &&
      env.accountAesKey &&
      contractAddress
  );
}
