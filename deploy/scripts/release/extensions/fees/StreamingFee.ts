import { StreamingFeeArgs } from '@taodao/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { deploy, get },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];
  const feeManager = await get('FeeManager');  
  const protocolFee = await get('ProtocolFee');

  await deploy('StreamingFee', {
    args: [feeManager.address, protocolFee.address] as StreamingFeeArgs,
    from: deployer.address,
    linkedData: {
      type: 'FEE',
    },
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['Release', 'Fees', 'StreamingFee'];
fn.dependencies = ['FeeManager', 'ProtocolFee'];

export default fn;
