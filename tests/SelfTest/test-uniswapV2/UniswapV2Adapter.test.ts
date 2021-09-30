import { extractEvent } from '@enzymefinance/ethers';
import {
  addZeroBalanceTrackedAssetsArgs,
  ComptrollerLib,
  IntegrationManagerActionId,
  StandardToken,
  VaultLib,
  WETH,
  IMigrationHookHandler,
  uniswapV2SwapArgs,
  UniswapV2Router
} from '@taodao/protocol';
import { 
   createNewFund,
   buyShares, 
   ProtocolDeployment,
   getAssetBalances,
   deployProtocolFixture, } from '@taodao/testutils';
import { utils, BigNumber } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const denominationAsset = new StandardToken(config.weth, whales.weth);
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

  // Deploy connected mocks for ComptrollerProxy and VaultProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.getAccessor.returns(mockComptrollerProxy);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      vaultProxy,
    },
    mockComptrollerProxy,
    mockVaultProxy,
    denominationAsset,
    deployer
  };
}

describe('callOnExtension actions', () => {
  // describe('test', () => {
  //   it('successfully adds each asset to tracked assets', async () => {
  //     const {
  //       deployment: { integrationManager, uniswapV2Adapter, dispatcher, vaultLib },
  //       config: {
  //         primitives: { mln, dai },
  //       },
  //       fund: { comptrollerProxy, fundOwner, vaultProxy },
  //       accounts: [investor],
  //       denominationAsset,
  //       mockComptrollerProxy,
  //       deployer
  //     } = await provider.snapshot(snapshot);

      
  //     const assetToAdd1 = new StandardToken(mln, whales.mln);
  //     const assetToAdd2 = new StandardToken(dai, whales.dai);

  //     // Neither asset to add should be tracked
  //     expect(await vaultProxy.isTrackedAsset(assetToAdd1)).toBe(false);
  //     expect(await vaultProxy.isTrackedAsset(assetToAdd2)).toBe(false);

  //     // Add the assets
  //     await comptrollerProxy
  //       .connect(fundOwner)
  //       .callOnExtension(
  //         integrationManager,
  //         IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
  //         addZeroBalanceTrackedAssetsArgs({ assets: [assetToAdd1, assetToAdd2] }),
  //       );

  //     // Both assets should now be tracked
  //     expect(await vaultProxy.isTrackedAsset(assetToAdd1)).toBe(true);
  //     expect(await vaultProxy.isTrackedAsset(assetToAdd2)).toBe(true);

      
  //     const investmentAmount = utils.parseEther('2');
  //     const feeAmount = utils.parseEther('0.1');

  //     await comptrollerProxy.connect(investor).redeemSharesToDenom(
  //       uniswapV2Adapter,
  //       // investmentAmount,
  //       // [assetToAdd1.address],
  //       // [investmentAmount],
  //       // [feeAmount],
  //       // investmentAmount
  //     );
  //   });
  // });

});

describe('takeOrder', () => {
  it('can swap assets directly', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
    const incomingAsset = weth;
    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const path = [outgoingAsset, incomingAsset];
    const outgoingAssetAmount = utils.parseEther('0.1');
    const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    // Seed fund and take order
    await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

    
    const swapArgs = uniswapV2SwapArgs({
        outgoingAssetAmount,
        outgoingAsset,
        incomingAsset
    });

    // Swap directly
    await fork.deployment.integrationManager.connect(fundOwner).actionForRedeem(
      fork.deployment.uniswapV2Adapter,
      [outgoingAssetAmount],
      [outgoingAsset]
    )
    await fork.deployment.uniswapV2Adapter.swapForRedeem(vaultProxy, swapArgs);

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

    console.log("======incomingAssetAmount", 
    Number(BigNumber.from(incomingAssetAmount)),    
    Number(BigNumber.from(amountsOut[1])),
    Number(BigNumber.from(postTxOutgoingAssetBalance)));
    expect(incomingAssetAmount).toEqBigNumber(amountsOut[1]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });

  // it('can swap assets via an intermediary', async () => {
  //   const weth = new StandardToken(fork.config.weth, whales.weth);
  //   const outgoingAsset = new StandardToken(fork.config.primitives.mln, whales.mln);
  //   const incomingAsset = new StandardToken(fork.config.primitives.knc, provider);
  //   const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
  //   const [fundOwner] = fork.accounts;

  //   const { comptrollerProxy, vaultProxy } = await createNewFund({
  //     signer: fundOwner,
  //     fundOwner,
  //     fundDeployer: fork.deployment.fundDeployer,
  //     denominationAsset: weth,
  //   });

  //   const path = [outgoingAsset, weth, incomingAsset];
  //   const outgoingAssetAmount = utils.parseEther('0.1');

  //   await outgoingAsset.transfer(vaultProxy, outgoingAssetAmount);

  //   const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);

  //   const [preTxIncomingAssetBalance] = await getAssetBalances({
  //     account: vaultProxy,
  //     assets: [incomingAsset, outgoingAsset],
  //   });

  //   const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
  //     account: vaultProxy,
  //     assets: [incomingAsset, outgoingAsset],
  //   });

  //   const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);
  //   expect(incomingAssetAmount).toEqBigNumber(amountsOut[2]);
  //   expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  // });
});

