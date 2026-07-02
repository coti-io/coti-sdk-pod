import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { loadEnv } from "./lib/env.ts";

const env = loadEnv();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    sepolia: {
      url: env.sepoliaRpcUrl ?? "http://127.0.0.1:8545",
      chainId: 11155111,
      accounts: env.sepoliaPrivateKey ? [env.sepoliaPrivateKey] : [],
    },
  },
};

export default config;
