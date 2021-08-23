import type { FeeManagerArgs } from '@taodao/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const fundDeployer = await get('FundDeployer');
  const protocolFee = await get('ProtocolFee');

  await deploy('FeeManager', {
    args: [fundDeployer.address, protocolFee.address] as FeeManagerArgs,
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'FeeManager'];
fn.dependencies = ['FundDeployer', 'ProtocolFee'];

export default fn;
