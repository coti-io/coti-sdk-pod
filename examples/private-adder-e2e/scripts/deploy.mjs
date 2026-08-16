/**
 * Deploy PrivateAdder to Sepolia (CREATE3 inbox from PodNetworkConstants).
 * Usage: node scripts/deploy.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const rpc = process.env.SEPOLIA_RPC_URL?.trim();
const key = process.env.SEPOLIA_PRIVATE_KEY?.trim();
if (!rpc || !key) {
  console.error("Need SEPOLIA_RPC_URL and SEPOLIA_PRIVATE_KEY");
  process.exit(1);
}

const artifact = JSON.parse(
  readFileSync(
    join(root, "artifacts/contracts/PrivateAdder.sol/PrivateAdder.json"),
    "utf8"
  )
);

const provider = new ethers.JsonRpcProvider(rpc, 11155111);
const wallet = new ethers.Wallet(
  key.startsWith("0x") ? key : `0x${key}`,
  provider
);
console.log(`deployer ${wallet.address}`);
const factory = new ethers.ContractFactory(
  artifact.abi,
  artifact.bytecode,
  wallet
);
const contract = await factory.deploy();
await contract.waitForDeployment();
const address = await contract.getAddress();
const inbox = await contract.inbox();
console.log(`PrivateAdder ${address}`);
console.log(`inbox() ${inbox}`);

const deployed = {
  sepolia: {
    privateAdder: address,
    deployedAt: new Date().toISOString(),
  },
};
writeFileSync(join(root, "deployed.json"), JSON.stringify(deployed, null, 2) + "\n");

const envPath = join(root, ".env");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  const line = `PRIVATE_ADDER_SEPOLIA_ADDRESS=${address}`;
  const updated = content.match(/^PRIVATE_ADDER_SEPOLIA_ADDRESS=/m)
    ? content.replace(/^PRIVATE_ADDER_SEPOLIA_ADDRESS=.*$/m, line)
    : `${content.replace(/\n?$/, "\n")}${line}\n`;
  writeFileSync(envPath, updated);
}
