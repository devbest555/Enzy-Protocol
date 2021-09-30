import { deploy, randomAddress } from '@enzymefinance/ethers';
import { createUnsignedZeroExV2Order, 
  signZeroExV2Order, 
  StandardToken, 
  redeemEncodeZeroExV2Order,
  signatureOrder
} from '@taodao/protocol';
import {
  createNewFund,
  ProtocolDeployment,
  getAssetBalances,
  deployProtocolFixture,
  zeroExV2TakeOrder,
} from '@taodao/testutils';
import { BigNumber, constants, utils } from 'ethers';

const erc20Proxy = '0x95e6f48254609a6ee006f7d493c8e5fb97094cef';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployer,
    deployment,
    config,
  } = await deployProtocolFixture();

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new StandardToken(config.synthetix.susd, deployer),
  });

  return {
    accounts: remainingAccounts,
    deployer,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('takeOrder', () => {
  // it('works as expected without takerFee', async () => {
  //   const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
  //   const weth = new StandardToken(fork.config.weth, fork.deployer);
  //   const outgoingAsset = new StandardToken(fork.config.primitives.dai, fork.deployer);
  //   const incomingAsset = weth;
  //   const [fundOwner, maker] = fork.accounts;
  //   console.log("====deployer::", fork.deployer.address);
  //   const { comptrollerProxy, vaultProxy } = await createNewFund({
  //     signer: fundOwner,
  //     fundOwner,
  //     fundDeployer: fork.deployment.fundDeployer,
  //     denominationAsset: weth,
  //   });

  //   // Add the maker to the allowed list of maker addresses
  //   await zeroExV2Adapter.addAllowedMakers([maker]);

  //   // Define the order params
  //   const makerAssetAmount = utils.parseEther('0.1');
  //   const takerAssetAmount = utils.parseEther('0.1');
  //   const takerAssetFillAmount = takerAssetAmount;

  //   // Seed the maker and create a 0x order
  //   await incomingAsset.transfer(maker, makerAssetAmount);
  //   await incomingAsset.connect(maker).approve(erc20Proxy, makerAssetAmount);
  //   const unsignedOrder = await createUnsignedZeroExV2Order({
  //     exchange: fork.config.zeroex.exchange,
  //     maker,
  //     expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
  //     feeRecipientAddress: constants.AddressZero,
  //     makerAssetAmount,
  //     takerAssetAmount,
  //     takerFee: BigNumber.from(0),
  //     makerAsset: incomingAsset,
  //     takerAsset: outgoingAsset,
  //   });
  //   const signedOrder = await signZeroExV2Order(unsignedOrder, maker);

  //   // Seed the fund
  //   await outgoingAsset.transfer(vaultProxy, takerAssetAmount);

  //   const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
  //     account: vaultProxy,
  //     assets: [incomingAsset, outgoingAsset],
  //   });

  //   // Take the 0x order
  //   await zeroExV2TakeOrder({
  //     comptrollerProxy,
  //     vaultProxy,
  //     integrationManager: fork.deployment.integrationManager,
  //     fundOwner,
  //     zeroExV2Adapter: fork.deployment.zeroExV2Adapter,
  //     signedOrder,
  //     takerAssetFillAmount,
  //   });

  //   const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
  //     account: vaultProxy,
  //     assets: [incomingAsset, outgoingAsset],
  //   });

  //   const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

  //   expect(incomingAssetAmount).toEqBigNumber(makerAssetAmount);
  //   expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(takerAssetFillAmount));
  // });

  // it('works as expected with takerFee', async () => {
  //   const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
  //   const denominationAsset = new StandardToken(fork.config.weth, provider);
  //   const outgoingAsset = new StandardToken(fork.config.primitives.zrx, fork.deployer);
  //   const incomingAsset = new StandardToken(fork.config.primitives.dai, fork.deployer);
  //   const [fundOwner, maker] = fork.accounts;

  //   const { comptrollerProxy, vaultProxy } = await createNewFund({
  //     signer: fundOwner,
  //     fundOwner,
  //     fundDeployer: fork.deployment.fundDeployer,
  //     denominationAsset,
  //   });

  //   // Add the maker to the allowed list of maker addresses
  //   await zeroExV2Adapter.addAllowedMakers([maker]);

  //   // Define the order params
  //   const makerAssetAmount = utils.parseEther('1');
  //   const takerAssetAmount = utils.parseEther('1');
  //   const takerFee = utils.parseEther('0.0001');
  //   const takerAssetFillAmount = utils.parseEther('1');

  //   // Seed the maker and create a 0x order
  //   await incomingAsset.transfer(maker, makerAssetAmount);
  //   await incomingAsset.connect(maker).approve(erc20Proxy, makerAssetAmount);
  //   const unsignedOrder = await createUnsignedZeroExV2Order({
  //     exchange: fork.config.zeroex.exchange,
  //     maker,
  //     expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
  //     feeRecipientAddress: randomAddress(),
  //     makerAssetAmount,
  //     takerAssetAmount,
  //     takerFee,
  //     makerAsset: incomingAsset,
  //     takerAsset: outgoingAsset,
  //   });
  //   const signedOrder = await signZeroExV2Order(unsignedOrder, maker);

  //   // Seed the fund
  //   await outgoingAsset.transfer(vaultProxy, takerFee.add(takerAssetAmount));

  //   const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
  //     account: vaultProxy,
  //     assets: [incomingAsset, outgoingAsset],
  //   });

  //   // Take the 0x order
  //   await zeroExV2TakeOrder({
  //     comptrollerProxy,
  //     vaultProxy,
  //     integrationManager: fork.deployment.integrationManager,
  //     fundOwner,
  //     zeroExV2Adapter,
  //     signedOrder,
  //     takerAssetFillAmount,
  //   });

  //   const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
  //     account: vaultProxy,
  //     assets: [incomingAsset, outgoingAsset],
  //   });

  //   const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
  //   expect(incomingAssetAmount).toEqBigNumber(makerAssetAmount);
  //   expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(takerAssetFillAmount.add(takerFee)));
  // });

  // it('partially fill an order', async () => {
  //   const zeroExV2Adapter = fork.deployment.zeroExV2Adapter;
  //   const weth = new StandardToken(fork.config.weth, fork.deployer);
  //   const outgoingAsset = weth;
  //   const incomingAsset = new StandardToken(fork.config.primitives.dai, fork.deployer);
  //   const [fundOwner, maker] = fork.accounts;

  //   const { comptrollerProxy, vaultProxy } = await createNewFund({
  //     signer: fundOwner,
  //     fundOwner,
  //     fundDeployer: fork.deployment.fundDeployer,
  //     denominationAsset: weth,
  //   });

  //   // Add the maker to the allowed list of maker addresses
  //   await zeroExV2Adapter.addAllowedMakers([maker]);

  //   // Define the order params
  //   const makerAssetAmount = utils.parseEther('1');
  //   const takerAssetAmount = utils.parseEther('0.1');
  //   const takerAssetFillAmount = utils.parseEther('0.03');
  //   const expectedIncomingAssetAmount = makerAssetAmount.mul(takerAssetFillAmount).div(takerAssetAmount);

  //   // Seed the maker and create a 0x order
  //   await incomingAsset.transfer(maker, makerAssetAmount);
  //   await incomingAsset.connect(maker).approve(erc20Proxy, makerAssetAmount);
  //   const unsignedOrder = await createUnsignedZeroExV2Order({
  //     exchange: fork.config.zeroex.exchange,
  //     maker,
  //     expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
  //     feeRecipientAddress: constants.AddressZero,
  //     makerAssetAmount,
  //     takerAssetAmount,
  //     takerFee: BigNumber.from(0),
  //     makerAsset: incomingAsset,
  //     takerAsset: outgoingAsset,
  //   });
  //   const signedOrder = await signZeroExV2Order(unsignedOrder, maker);

  //   // Seed the fund
  //   await outgoingAsset.transfer(vaultProxy, takerAssetFillAmount);
  //   const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance] = await getAssetBalances({
  //     account: vaultProxy,
  //     assets: [incomingAsset, outgoingAsset],
  //   });

  //   // Take the 0x order
  //   await zeroExV2TakeOrder({
  //     comptrollerProxy,
  //     vaultProxy,
  //     integrationManager: fork.deployment.integrationManager,
  //     fundOwner,
  //     zeroExV2Adapter,
  //     signedOrder,
  //     takerAssetFillAmount,
  //   });

  //   const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
  //     account: vaultProxy,
  //     assets: [incomingAsset, outgoingAsset],
  //   });

  //   const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
  //   expect(incomingAssetAmount).toEqBigNumber(expectedIncomingAssetAmount);
  //   expect(postTxOutgoingAssetBalance).toEqBigNumber(preTxOutgoingAssetBalance.sub(takerAssetFillAmount));
  // });
});

describe('fillOrderZeroEX', () => {  
  it('generates expected output without takerFee in fillOrderZeroEX()', async () => {
    const {
      deployer,
      config: {
        weth,
        primitives: { dai },
        zeroex: { exchange },
      },
      deployment: { dispatcher, zeroExV2Adapter },
    } = await provider.snapshot(snapshot);
    
    const [fundOwner, maker] = fork.accounts;
    
    const takerAsset = new StandardToken(weth, deployer);
    const makerAsset = new StandardToken(dai, deployer);

    const fundDeployerOwner = await dispatcher.getOwner();
    const adapter = zeroExV2Adapter.connect(await provider.getSignerWithAddress(fundDeployerOwner));

    await adapter.addAllowedMakers([deployer]);

    const feeRecipientAddress = constants.AddressZero;
    const takerFee = BigNumber.from(0);
    // Define the order params
    const makerAssetAmount = utils.parseUnits('100', await makerAsset.decimals());
    const takerAssetAmount = utils.parseEther('0.05');

    // Seed the maker and create a 0x order
    console.log("===dai::", dai);
    console.log("===deployer::", deployer.address);
    console.log("===deployer balance::", Number(BigNumber.from(await makerAsset.balanceOf(deployer.address))));
    await makerAsset.transfer(maker, makerAssetAmount);
    await makerAsset.connect(maker).approve(erc20Proxy, makerAssetAmount);
    const unsignedOrder = await createUnsignedZeroExV2Order({
      exchange,
      maker: deployer,
      feeRecipientAddress,
      makerAssetAmount,
      takerAssetAmount,
      takerFee,
      makerAsset: makerAsset,
      takerAsset: takerAsset,
      expirationTimeSeconds: (await provider.getBlock('latest')).timestamp + 60 * 60 * 24,
    });

    // const signedOrder = await signZeroExV2Order(unsignedOrder, deployer);
    const orderArgs = redeemEncodeZeroExV2Order(unsignedOrder);

    const signature = await signatureOrder(unsignedOrder, deployer);

    console.log("=====takerAsset::", takerAsset.address);
    const fillResult = await zeroExV2Adapter.fillOrderZeroEX(orderArgs, signature);
    console.log("=====fillResult::", fillResult);
    // const result = await zeroExV2Adapter.parseAssetsForMethod(takeOrderSelector, takeOrderArgs);

    // expect(result).toMatchFunctionOutput(zeroExV2Adapter.parseAssetsForMethod, {
    //   incomingAssets_: [incomingAsset],
    //   spendAssets_: [outgoingAsset],
    //   spendAssetAmounts_: [takerAssetFillAmount],
    //   minIncomingAssetAmounts_: [expectedMinIncomingAssetAmount],
    //   spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
    // });
  });
});
