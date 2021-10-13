import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { resolve } from "path";
import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";
import "./tasks/clean";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const chainIds = {
  goerli: 5,
  hardhat: 1337,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
  arbitrum: 42161,
};

// Ensure that we have all the environment variables we need.
const mnemonic: string | undefined = process.env.MNEMONIC;
if (!mnemonic) {
  console.warn("Please set your MNEMONIC in a .env file");
}

const infuraApiKey: string | undefined = process.env.INFURA_API_KEY;
if (!infuraApiKey) {
  console.warn("Please set your INFURA_API_KEY in a .env file");
}

const mainnetForkUrl: string | undefined = process.env.MAINNET_FORK_URL;
if (!mainnetForkUrl) {
  throw new Error("Please set your MAINNET_FORK_URL in a .env file");
}

function getChainConfig(network: keyof typeof chainIds, apiKey: string): NetworkUserConfig {
  const url: string = "https://" + network + ".infura.io/v3/" + apiKey;
  return {
    url,
    chainId: chainIds[network],
    ...(mnemonic && {
      accounts: {
        count: 10,
        mnemonic,
        path: "m/44'/60'/0'/0",
      },
    }),
  };
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
  networks: {
    hardhat: {
      forking: {
        url: mainnetForkUrl,
        blockNumber: 13406658,
      },
      chainId: chainIds.hardhat,
    },
    ...(infuraApiKey && {
      mainnet: getChainConfig("mainnet", infuraApiKey),
      arbitrum: getChainConfig("arbitrum", infuraApiKey),
      goerli: getChainConfig("goerli", infuraApiKey),
      kovan: getChainConfig("kovan", infuraApiKey),
      rinkeby: getChainConfig("rinkeby", infuraApiKey),
      ropsten: getChainConfig("ropsten", infuraApiKey),
    }),
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.6.6",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/solidity-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
    },
  },
  mocha: {
    timeout: 600000,
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
};

export default config;
