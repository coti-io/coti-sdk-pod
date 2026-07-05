import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import dotenv from "dotenv";

dotenv.config();

function sepoliaAccounts(): string[] {
  const raw = process.env.SEPOLIA_PRIVATE_KEY?.trim();
  if (!raw) return [];
  return [raw.startsWith("0x") ? raw : `0x${raw}`];
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL?.trim() ?? "http://127.0.0.1:8545",
      chainId: 11155111,
      accounts: sepoliaAccounts(),
    },
  },
};

export default config;
