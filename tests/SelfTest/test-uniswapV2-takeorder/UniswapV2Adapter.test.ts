import { MockReentrancyToken, StandardToken, WETH, UniswapV2Router } from '@taodao/protocol';
import {
  assertEvent,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  generateRegisteredMockFees,
  getAssetBalances,
} from '@taodao/testutils';
import { utils, BigNumber } from 'ethers';

async function snapshot() {
  const {
    deployer,
    deployment,
    config,
    accounts: [fundOwner, ...remainingAccounts],
  } = await deployProtocolFixture();

  const weth = new WETH(config.weth, whales.weth);
  const fees = await generateRegisteredMockFees({
    deployer,
    feeManager: deployment.feeManager,
  });

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: weth,
  });

  const reentrancyToken = await MockReentrancyToken.deploy(deployer);
  await deployment.chainlinkPriceFeed.addPrimitives(
    [reentrancyToken],
    [config.chainlink.aggregators.dai[0]],
    [config.chainlink.aggregators.dai[1]],
  );

  // Seed some accounts with some weth.
  const seedAmount = utils.parseEther('100');
  const seedAccounts = [fundOwner, remainingAccounts[0], remainingAccounts[1]];
  await Promise.all(seedAccounts.map((account) => weth.transfer(account.address, seedAmount)));

  return {
    weth,
    fees,
    deployer,
    accounts: remainingAccounts,
    config,
    deployment,
    reentrancyToken,
    fund: {
      denominationAsset: weth,
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

describe('buyShares', () => {
  // it('works for a fund with no extensions (single buyShares)', async () => {
  //   const {
  //     fund: { denominationAsset },
  //     deployment: { fundDeployer },
  //     accounts: [signer, buyer],
  //   } = await provider.snapshot(snapshot);

  //   const { comptrollerProxy, vaultProxy } = await createNewFund({
  //     signer,
  //     fundDeployer,
  //     denominationAsset,
  //   });

  //   const investmentAmount = utils.parseEther('2');
  //   const receipt = await buyShares({
  //     comptrollerProxy,
  //     signer,
  //     buyers: [buyer],
  //     denominationAsset,
  //     investmentAmounts: [investmentAmount],
  //   });

  //   // Assert Events
  //   assertEvent(receipt, 'SharesBought', {
  //     caller: await signer.getAddress(),
  //     buyer: await buyer.getAddress(),
  //     investmentAmount,
  //     sharesIssued: investmentAmount,
  //     sharesReceived: investmentAmount,
  //   });

  //   // Assert calls on ComptrollerProxy
  //   const calcGavCall = await comptrollerProxy.calcGav.args(true).call();
  //   expect(calcGavCall).toMatchFunctionOutput(comptrollerProxy.calcGav, {
  //     gav_: investmentAmount,
  //     isValid_: true,
  //   });

  //   const calcGrossShareValueCall = await comptrollerProxy.calcGrossShareValue.call();
  //   expect(calcGrossShareValueCall).toMatchFunctionOutput(comptrollerProxy.calcGrossShareValue, {
  //     grossShareValue_: utils.parseEther('1'),
  //     isValid_: true,
  //   });

  //   // Assert calls on VaultProxy
  //   // TODO: does this belong here?
  //   const sharesBuyerBalanceCall = await vaultProxy.balanceOf(buyer);
  //   expect(sharesBuyerBalanceCall).toEqBigNumber(investmentAmount);
  //   const sharesTotalSupplyCall = await vaultProxy.totalSupply();
  //   expect(sharesTotalSupplyCall).toEqBigNumber(sharesBuyerBalanceCall);
  //   const trackedAssetsCall = await vaultProxy.getTrackedAssets();
  //   expect(trackedAssetsCall).toContain(denominationAsset.address);
  //   const isTrackedAssetCall = await vaultProxy.isTrackedAsset(denominationAsset);
  //   expect(isTrackedAssetCall).toBe(true);

  // });

});

describe('redeemSharesToDenomDetailed', () => {
  it('handles a valid call (one additional asset)', async () => {
    const {
      fund: { denominationAsset },
      deployment: { fundDeployer, uniswapV2Adapter },
      accounts: [fundManager, investor],
      config: {
        primitives: { mln, dai },
      },
    } = await provider.snapshot(snapshot);

    const uniswapRouter = new UniswapV2Router(fork.config.uniswap.router, provider);
    // Create a new fund, and invested in equally by the fund manager and an investor
    const investmentAmount = utils.parseEther('10');
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundManager,
      fundDeployer,
      denominationAsset,
      investment: {
        signer: fundManager,
        buyers: [fundManager],
        investmentAmounts: [investmentAmount],
      },
    });

    const buyAmount = utils.parseEther('2');
    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [buyAmount],
    });

    // Send untracked asset directly to fund
    const daiAsset = new StandardToken(dai, whales.dai);
    const daiAssetBalance = utils.parseEther('100')
    await daiAsset.transfer(vaultProxy, daiAssetBalance);
    const mlnAsset = new StandardToken(mln, whales.mln);
    const mlnAssetBalance = utils.parseEther('20');
    await mlnAsset.transfer(vaultProxy, mlnAssetBalance);

    // Define the redemption params and the expected payout assets
    const redeemQuantity = utils.parseEther('2');//it must be less than buyAmount
    const additionalAssets = [daiAsset, mlnAsset];

    const uniswapPath = [daiAsset, denominationAsset];    
    const uniswapPath1 = [mlnAsset, denominationAsset];    

    const [preTxIncomingAssetBalance, preTxOutgoingAssetBalance, preTxOutgoingAssetBalance1] = await getAssetBalances({
      account: vaultProxy,
      assets: [denominationAsset, daiAsset, mlnAsset],
    });            

    const investorSharesBalanceCall = await vaultProxy.balanceOf(investor);
    expect(investorSharesBalanceCall).toEqBigNumber(buyAmount);

    const receipt = await comptrollerProxy.connect(investor).redeemSharesToDenomDetailed(uniswapV2Adapter, redeemQuantity, additionalAssets);

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance, postTxOutgoingAssetBalance1] = await getAssetBalances({
      account: vaultProxy,
      assets: [denominationAsset, daiAsset, mlnAsset],
    });
    
    const investorSharesBalanceAfterRdeem = await vaultProxy.balanceOf(investor);
    expect(investorSharesBalanceAfterRdeem).toEqBigNumber(buyAmount.sub(redeemQuantity));
    console.log("====data-post::", 
    Number(BigNumber.from(preTxIncomingAssetBalance)),
    Number(BigNumber.from(preTxOutgoingAssetBalance)),
    Number(BigNumber.from(postTxIncomingAssetBalance)),
    Number(BigNumber.from(postTxOutgoingAssetBalance)));

    const diffIncomAsset = preTxIncomingAssetBalance.sub(postTxIncomingAssetBalance);

    const diffDai = preTxOutgoingAssetBalance.sub(postTxOutgoingAssetBalance);
    const diffmln = preTxOutgoingAssetBalance1.sub(postTxOutgoingAssetBalance1);
    const expectedSwapDenom = (await uniswapRouter.getAmountsOut(diffDai, uniswapPath))[1];
    const expectedSwapDenom1 = (await uniswapRouter.getAmountsOut(diffmln, uniswapPath1))[1];
    const redeemAmount = redeemQuantity.add(expectedSwapDenom).add(expectedSwapDenom1);
    
    console.log("====data-::", 
    Number(BigNumber.from(diffIncomAsset)),
    Number(BigNumber.from(diffDai)),
    Number(BigNumber.from(diffmln)),
    Number(BigNumber.from(expectedSwapDenom)),
    Number(BigNumber.from(redeemAmount)));

    // assertEvent(receipt, 'SharesRedeemedToDenom', {
    //   redeemer: investor,
    //   sharesQuantity: redeemQuantity,
    //   denominationAsset: denominationAsset,
    //   amountToDenom: redeemAmount,
    // });
    

    // for (const key in expectedPayoutAssets) {
    //   const expectedBalance = preExpectedPayoutAssetBalances[key].add(expectedPayoutAmounts[key]);
    //   expect(postExpectedPayoutAssetBalances[key]).toEqBigNumber(expectedBalance);
    // }
  });
});

describe('redeemShares', () => {
  // it('allows sender to redeem all their shares', async () => {
  //   const {
  //     fund: { denominationAsset },
  //     deployment: { fundDeployer },
  //     accounts: [fundManager, investor],
  //   } = await provider.snapshot(snapshot);

  //   const balanceBefore = await denominationAsset.balanceOf(investor);

  //   const investmentAmount = utils.parseEther('2');
  //   const { comptrollerProxy, vaultProxy } = await createNewFund({
  //     signer: fundManager,
  //     fundDeployer,
  //     denominationAsset,
  //     investment: {
  //       signer: investor,
  //       buyers: [investor],
  //       investmentAmounts: [investmentAmount],
  //     },
  //   });

  //   await redeemShares({
  //     comptrollerProxy,
  //     signer: investor,
  //   });

  //   // Redeemer should have their investment amount back and 0 shares
  //   const sharesBalanceAfter = await vaultProxy.balanceOf(investor);
  //   expect(sharesBalanceAfter).toEqBigNumber(0);

  //   const balanceAfter = await denominationAsset.balanceOf(investor);
  //   expect(balanceAfter).toEqBigNumber(balanceBefore);
  // });
});
