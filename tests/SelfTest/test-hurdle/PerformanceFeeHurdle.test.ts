// import { AddressLike, extractEvent, MockContract } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  FeeHook,
  FeeManager,
  FeeSettlementType,
  PerformanceFeeHurdle,
  hurdleConfigArgs,
  VaultLib,
  WETH,
} from '@taodao/protocol';
import {
  // addTrackedAssets,
  assertEvent,
  // buyShares,
  // callOnExtension,
  // createFundDeployer,
  // createNewFund,
  deployProtocolFixture,
  // redeemShares,
  transactionTimestamp,
  // updateChainlinkAggregator,
} from '@taodao/testutils';
import {
  BigNumber,
  // BigNumberish,
  // BytesLike,
  constants,
  utils,
} from 'ethers';
// import { config } from 'dotenv';

describe('integration', () => {
  // it('1', async () => {
  //   const {
  //     accounts: [fundOwner, investor],
  //     config,
  //     deployment: { performanceFeeHurdle, fundDeployer },
  //     deployer,
  //   } = await provider.snapshot(snapshot);
  //   const denominationAsset = new WETH(config.weth, deployer);
  //   const { comptrollerProxy } = await createNewFund({
  //     signer: fundOwner,
  //     fundDeployer,
  //     denominationAsset,
  //     fundOwner: fundOwner,
  //     fundName: 'TestFund',
  //     feeManagerConfig: feeManagerConfigArgs({
  //       fees: [performanceFeeHurdle],
  //       settings: [
  //         hurdleConfigArgs({
  //           rate: utils.parseEther('.1'),// 10 %
  //           period: BigNumber.from(60 * 60 * 24 * 31), // 31 days
  //           hurdleRate:utils.parseEther('.05'),// 5 %
  //         }),
  //       ],
  //     }),
  //   });
  //   const initialInvestmentAmount = utils.parseEther('2');
  //   await denominationAsset.transfer(investor, initialInvestmentAmount);
  //   await buyShares({
  //     comptrollerProxy,
  //     signer: investor,
  //     buyers: [investor],
  //     denominationAsset,
  //     investmentAmounts: [initialInvestmentAmount],
  //   });
  //   // Performance fee state should be in expected initial configuration
  //   const initialFeeInfo = await performanceFeeHurdle.getFeeInfoForFund(comptrollerProxy);
  //   console.log("=======initialFeeInfo::",
  //   Number(BigNumber.from(initialFeeInfo.rate)),//10**17 = 10%
  //   Number(BigNumber.from(initialFeeInfo.period)),//1 year
  //   Number(BigNumber.from(initialFeeInfo.activated)),//1629718184
  //   Number(BigNumber.from(initialFeeInfo.lastPaid)),//0
  //   Number(BigNumber.from(initialFeeInfo.hurdleRate)),//0.05*10**18
  //   Number(BigNumber.from(initialFeeInfo.lastSharePrice)));//2*10**6
  //   // Redeem small amount of shares
  //   const redeemTx1 = await redeemShares({
  //     comptrollerProxy,
  //     signer: investor,
  //     quantity: initialInvestmentAmount.div(4),
  //   });
  //   // The fees should not have emitted a failure event
  //   const failureEvents1 = extractEvent(redeemTx1 as any, 'PreRedeemSharesHookFailed');
  //   console.log("=====failureEvents1::", failureEvents1);
  //   // Performance fee state should be exactly the same
  //   const feeInfo2 = await performanceFeeHurdle.getFeeInfoForFund(comptrollerProxy);
  //   console.log("=======feeInfo2::",
  //   Number(BigNumber.from(feeInfo2.rate)),//10**17 = 10%
  //   Number(BigNumber.from(feeInfo2.period)),//1 year
  //   Number(BigNumber.from(feeInfo2.activated)),//1629718184
  //   Number(BigNumber.from(feeInfo2.lastPaid)),//0
  //   Number(BigNumber.from(feeInfo2.hurdleRate)),//0.05*10**18
  //   Number(BigNumber.from(feeInfo2.lastSharePrice)));//2*10**6
  // });
});

describe('payout', () => {
  it('1', async () => {
    const {
      // accounts,
      // deployment,
      config,
      deployer,
    } = await deployProtocolFixture();

    const initAssetAmount = utils.parseEther('1');
    const nextAssetAmount = utils.parseEther('2');

    // Mock a FeeManager
    const mockFeeManager = await FeeManager.mock(deployer);

    // Create standalone PerformanceFee
    const performanceFeeHurdle = await PerformanceFeeHurdle.deploy(deployer, mockFeeManager);

    // Mock a denomination asset
    const mockDenominationAsset = new WETH(config.weth, deployer);

    // Mock a VaultProxy
    const mockVaultProxy = await VaultLib.mock(deployer);
    await mockVaultProxy.totalSupply.returns(0);
    await mockVaultProxy.balanceOf.returns(0);

    // Mock a ComptrollerProxy
    const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
    await mockComptrollerProxy.getDenominationAsset.returns(mockDenominationAsset);
    await mockComptrollerProxy.calcGav.returns(initAssetAmount, true);
    await mockVaultProxy.totalSupply.returns(initAssetAmount);
    await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);
    await mockComptrollerProxy.calcEachBalance.returns(initAssetAmount);

    // Add fee settings for ComptrollerProxy
    const performanceFeeRate = utils.parseEther('.1'); // 10%
    const hurdleRate = utils.parseEther('.05'); // 5%
    const performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
    const performanceFeeConfig = hurdleConfigArgs({
      rate: performanceFeeRate,
      period: performanceFeePeriod,
      hurdleRate: hurdleRate,
    });

    // Raise next high water mark by increasing price
    // await mockComptrollerProxy.calcEachBalance.returns(nextAssetAmount);

    await mockFeeManager.forward(performanceFeeHurdle.addFundSettings, mockComptrollerProxy, performanceFeeConfig);
    const feeInfo = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    console.log(
      '=====000 => ::',
      Number(BigNumber.from(feeInfo.rate)), //           10**17=10%
      Number(BigNumber.from(feeInfo.hurdleRate)), //     5/100*10**18=5%
      Number(BigNumber.from(feeInfo.lastAssetAmount)),
    ); //0

    await mockFeeManager.forward(performanceFeeHurdle.activateForFund, mockComptrollerProxy, mockVaultProxy);
    const feeInfoActive = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    console.log(
      '=====001 => ::',
      Number(BigNumber.from(feeInfoActive.rate)), //           10**17=10%
      Number(BigNumber.from(feeInfoActive.hurdleRate)), //     5/100*10**18=5%
      Number(BigNumber.from(feeInfoActive.lastAssetAmount)),
    ); //10**18

    const _initialAssetValue = utils.parseEther('1');
    const _currentAssetValue = utils.parseEther('2'); //await mockComptrollerProxy.calcEachBalance(mockDenominationAsset);
    const unit = utils.parseEther('1');
    console.log(
      '=====002 => ::',
      Number(BigNumber.from(_initialAssetValue)),
      Number(BigNumber.from(_currentAssetValue)),
    );
    const _hurdleRate = feeInfo.hurdleRate;
    const _rate = feeInfo.rate;
    const performanceAssetValue = BigNumber.from(_currentAssetValue).sub(
      _initialAssetValue.add(_initialAssetValue.mul(_hurdleRate).div(unit)),
    );
    const assetValueDue = performanceAssetValue.mul(_rate).div(unit);

    // Determine fee settlement type
    let feeSettlementType = FeeSettlementType.None;
    if (assetValueDue.gt(0)) {
      feeSettlementType = FeeSettlementType.Direct;
    }
    console.log(
      '=====003 => ::',
      Number(BigNumber.from(assetValueDue)),
      Number(BigNumber.from(performanceAssetValue)),
      feeSettlementType,
    );

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
    await provider.send('evm_mine', []);

    // settle.call()
    const feeHook = FeeHook.Continuous;
    const settlementData = constants.HashZero;
    await mockComptrollerProxy.calcEachBalance.returns(nextAssetAmount);
    const settleCall = await performanceFeeHurdle.settle
      .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData, 3)
      .from(mockFeeManager)
      .call();
    expect(settleCall).toMatchFunctionOutput(performanceFeeHurdle.settle, {
      settlementType_: feeSettlementType,
      assetAmountDue_: assetValueDue.abs(),
    });

    const payoutCall = await performanceFeeHurdle.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager)
      .call();
    expect(payoutCall).toBe(true);
    const feeInfo3 = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    console.log(
      '=====333 => ::',
      Number(BigNumber.from(feeInfo3.rate)), //           10**17=10%
      Number(BigNumber.from(feeInfo3.hurdleRate)), //     5/100*10**18=5%
      Number(BigNumber.from(feeInfo3.lastAssetAmount)),
    ); //

    const payoutReceipt = await mockFeeManager.forward(
      performanceFeeHurdle.payout,
      mockComptrollerProxy,
      mockVaultProxy,
    );

    const feeInfoPayout = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    const currentAssetAmount = feeInfoPayout.lastAssetAmount;
    const hurlde = feeInfoPayout.hurdleRate;
    assertEvent(payoutReceipt, 'PaidOut', {
      comptrollerProxy: mockComptrollerProxy,
      hurdleRate: hurlde,
      currentAssetAmount: currentAssetAmount,
    });

    await mockComptrollerProxy.calcEachBalance.returns(nextAssetAmount);
    await performanceFeeHurdle.update
      .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData, 3)
      .from(mockFeeManager)
      .call();

    const feeInfoUpdate = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    console.log(
      '=====555 => ::',
      Number(BigNumber.from(feeInfoUpdate.rate)),
      Number(BigNumber.from(feeInfoUpdate.hurdleRate)),
      Number(BigNumber.from(feeInfoUpdate.lastAssetAmount)),
    );
  });
});
