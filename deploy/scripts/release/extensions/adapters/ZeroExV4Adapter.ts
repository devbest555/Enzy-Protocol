import { ZeroExV2AdapterArgs } from '@taodao/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../../../utils/config';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  const integrationManager = await get('IntegrationManager');
  const fundDeployer = await get('FundDeployer');

  await deploy('ZeroExV4Adapter', {
    args: [
      integrationManager.address,
      config.zeroexV4.exchange,
      fundDeployer.address,
      config.zeroexV4.allowedMakers,
    ] as ZeroExV2AdapterArgs,
    from: deployer.address,
    linkedData: {
      type: 'ADAPTER',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Adapters', 'ZeroExV4Adapter'];
fn.dependencies = ['Config', 'IntegrationManager', 'FundDeployer'];

export default fn;
