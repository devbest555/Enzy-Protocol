import 'dotenv/config';
import '@enzymefinance/hardhat/plugin';
// import { utils } from 'ethers';

import { HardhatUserConfig } from 'hardhat/types';

function node(networkName: string) {
  const fallback = 'http://localhost:8545';
  const uppercase = networkName.toUpperCase();
  const uri = process.env[`ETHEREUM_NODE_${uppercase}`] || process.env.ETHEREUM_NODE || fallback;
  return uri.replace('{{NETWORK}}', networkName);
}

function accounts(networkName: string) {
  const uppercase = networkName.toUpperCase();
  const accounts = process.env[`ETHEREUM_ACCOUNTS_${uppercase}`] || process.env.ETHEREUM_ACCOUNTS || '';
  return accounts
    .split(',')
    .map((account) => account.trim())
    .filter(Boolean);
}

const mnemonic = process.env.MNEMONIC; //'test test test test test test test test test test test junk';//
// const etherScan_api_key = process.env.ETHERSCAN_API_KEY;

const config: HardhatUserConfig = {
  codeCoverage: {
    exclude: ['/mock/i'], // Ignore anything with the word "mock" in it.
  },
  codeGenerator: {
    abi: {
      path: './packages/protocol/artifacts',
    },
    bytecode: {
      path: './packages/protocol/artifacts',
    },
    clear: true,
    enabled: true,
    include: [
      // Explicitly allow inclusion of core release interfaces.
      'IDerivativePriceFeed',
      'IExtension',
      'IIntegrationAdapter',
      'IFee',
      'IPolicy',
      'IPrimitivePriceFeed',

      // TODO: Re-evaluate whether we should include these at all.
      'IMigrationHookHandler',
      'IMigratableVault',
      'IAlphaHomoraV1Bank',
      'IIdleTokenV4',
      'IChainlinkAggregator',
      'IMakerDaoPot',
      'IUniswapV2Factory',
      'IUniswapV2Pair',
      'IUniswapV2Router2',
      'IKyberNetworkProxy',
      'ICERC20',
      'ICEther',
      'ISynthetix',
      'ISynthetixAddressResolver',
      'ISynthetixDelegateApprovals',
      'ISynthetixExchangeRates',
      'ISynthetixExchanger',
      'ISynthetixProxyERC20',
      'ISynthetixSynth',
      'IYearnVaultV2',
    ],
    options: {
      ignoreContractsWithoutAbi: true,
      ignoreContractsWithoutBytecode: true,
    },
    typescript: {
      path: './packages/protocol/src/codegen',
    },
  },
  contractSizer: {
    disambiguatePaths: false,
  },
  namedAccounts: {
    deployer: 0,
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      hardfork: 'istanbul',
      accounts: {
        mnemonic,
      },
      forking: {
        blockNumber: 12540501,
        url: node('mainnet'), // May 31, 2021
      },
      // chainId: 42, //42
      // forking: {
      //   blockNumber: 27277405,
      //   url: node('kovan'),
      // },
      gas: 9500000,
      gasPrice: 0, // TODO: Consider removing this again.
      ...(process.env.COVERAGE && {
        allowUnlimitedContractSize: true,
      }),
    },
    arbitrum: {
      url: 'https://rinkeby.arbitrum.io/rpc',
      gasPrice: 0,
    },
    kovan: {
      hardfork: 'istanbul',
      accounts: {
        mnemonic,
      },
      // accounts: accounts('kovan'),
      url: node('kovan'),
    },
    mainnet: {
      hardfork: 'istanbul',
      accounts: accounts('mainnet'),
      url: node('mainnet'),
    },
  },
  // etherscan: {
  //   apiKey: etherScan_api_key
  // },
  paths: {
    deploy: 'deploy/scripts',
  },
  solidity: {
    settings: {
      optimizer: {
        details: {
          yul: false,
        },
        enabled: true,
        runs: 200,
      },
    },
    version: '0.6.12',
  },
};

export default config;
