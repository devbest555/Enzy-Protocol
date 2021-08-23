import { ProtocolFeeArgs } from '@taodao/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const dispatcher = await get('Dispatcher');

  await deploy('ProtocolFee', {
    args: [dispatcher.address] as ProtocolFeeArgs,
    from: deployer.address,
    // linkedData: {
    //   type: 'FEE',
    // },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Fees', 'ProtocolFee'];
fn.dependencies = ['Dispatcher'];

export default fn;
