import hre from "hardhat";
import { writeDeployedAddresses } from "../lib/env.ts";

async function main(): Promise<void> {
  const PrivateAdder = await hre.ethers.getContractFactory("PrivateAdder");
  const contract = await PrivateAdder.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  writeDeployedAddresses({
    sepolia: {
      privateAdder: address,
      deployedAt: new Date().toISOString(),
    },
  });

  console.log(`PrivateAdder deployed to ${address}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
