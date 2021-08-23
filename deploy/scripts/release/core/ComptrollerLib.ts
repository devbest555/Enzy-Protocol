import { ComptrollerLibArgs, FundDeployer as FundDeployerContract } from '@taodao/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get, log },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const dispatcher = await get('Dispatcher');
  const fundDeployer = await get('FundDeployer');
  const valueInterpreter = await get('ValueInterpreter');
  const feeManager = await get('FeeManager');
  const integrationManager = await get('IntegrationManager');
  const policyManager = await get('PolicyManager');
  const chainlinkPriceFeed = await get('ChainlinkPriceFeed');
  const synthetixPriceFeed = await get('SynthetixPriceFeed');
  const protocolFee = await get('ProtocolFee');

  const comptrollerLib = await deploy('ComptrollerLib', {
    args: [
      dispatcher.address,
      fundDeployer.address,
      valueInterpreter.address,
      feeManager.address,
      integrationManager.address,
      policyManager.address,
      chainlinkPriceFeed.address,
      synthetixPriceFeed.address,
      protocolFee.address,
      config.synthetix.addressResolver,
    ] as ComptrollerLibArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  if (comptrollerLib.newlyDeployed) {
    const fundDeployerInstance = new FundDeployerContract(fundDeployer.address, deployer);
    log('Updating ComptrollerLib on FundDeployer');
    await fundDeployerInstance.setComptrollerLib(comptrollerLib.address);
  }
};

fn.tags = ['Release', 'ComptrollerLib'];
fn.dependencies = [
  'Dispatcher',
  'FundDeployer',
  'ValueInterpreter',
  'FeeManager',
  'IntegrationManager',
  'PolicyManager',
  'ChainlinkPriceFeed',
  'SynthetixPriceFeed',
  'ProtocolFee'
];

export default fn;
