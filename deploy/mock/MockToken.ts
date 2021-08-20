import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function ({ deployments: { deploy }, ethers: { getSigners } }) {
  const deployer = (await getSigners())[0];

  await deploy('MockToken', {
    args: ["Mock USDC Token", "USDC", 6],
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  });
};

fn.tags = ['MockToken'];

export default fn;
