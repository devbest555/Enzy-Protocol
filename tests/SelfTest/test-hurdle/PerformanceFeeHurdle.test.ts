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
} from '@enzymefinance/testutils';
import { 
  BigNumber, 
  // BigNumberish, 
  // BytesLike, 
  constants, utils 
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
      config, deployer } = await deployProtocolFixture();

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
    // await mockVaultProxy.addTrackedAsset.returns(mockDenominationAsset);

    // Mock a ComptrollerProxy
    const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
    await mockComptrollerProxy.getDenominationAsset.returns(mockDenominationAsset);
    await mockComptrollerProxy.calcGav.returns(initAssetAmount, true);
    await mockVaultProxy.totalSupply.returns(initAssetAmount);
    await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);
    await mockComptrollerProxy.getInvestAmount.returns(initAssetAmount);
    
    // Add fee settings for ComptrollerProxy
    const performanceFeeRate = 10;//utils.parseEther('.1'); // 10%
    const hurdleRate = 5;//utils.parseEther('.05'); // 5%
    const performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
    const performanceFeeConfig = hurdleConfigArgs({
      rate: performanceFeeRate,
      period: performanceFeePeriod,
      hurdleRate: hurdleRate
    });

    // console.log("======data::", mockFeeManager.address, mockComptrollerProxy.address, mockVaultProxy.address, 
    // mockDenominationAsset.address, performanceFeeHurdle.address);

    // Raise next high water mark by increasing price
    // await mockComptrollerProxy.calcEachBalance.returns(nextAssetAmount);

    // Calculate expected performance results for next settlement    
    await mockFeeManager.forward(performanceFeeHurdle.addFundSettings, mockComptrollerProxy, performanceFeeConfig);
    const feeInfo = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    console.log("=====000 => ::", 
    Number(BigNumber.from(feeInfo.rate)),//           10**17=10%   
    Number(BigNumber.from(feeInfo.hurdleRate)),//     5/100*10**18=5%
    Number(BigNumber.from(feeInfo.lastAssetAmount))); //       

    const _initialAssetValue = await mockComptrollerProxy.getInvestAmount(mockDenominationAsset);
    const _currentAssetValue = utils.parseEther('2'); //await mockComptrollerProxy.calcEachBalance(mockDenominationAsset);
    console.log("=====001 => ::", Number(BigNumber.from(_initialAssetValue)), Number(BigNumber.from(_currentAssetValue)));
    const _hurdleRate = feeInfo.hurdleRate;
    const _rate = feeInfo.rate;
    const performanceAssetValue = BigNumber.from(_currentAssetValue).sub(
      _initialAssetValue.add(_initialAssetValue.mul(_hurdleRate).div(100))
    );  
    const assetValueDue = performanceAssetValue.mul(_rate).div(100);

    // Determine fee settlement type
    let feeSettlementType = FeeSettlementType.None;
    if (assetValueDue.gt(0)) {
      feeSettlementType = FeeSettlementType.Direct;
    } 
    console.log("=====111 => ::", 
    Number(BigNumber.from(assetValueDue)), 
    Number(BigNumber.from(performanceAssetValue)),
    feeSettlementType); 

    // settle.call()
    const feeHook = FeeHook.Continuous;
    const settlementData = constants.HashZero;
    await mockComptrollerProxy.calcEachBalance.returns(nextAssetAmount);
      
    const feeInfo1 = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    console.log("=====222 => ::", 
    Number(BigNumber.from(feeInfo1.rate)),//           10**17=10%   
    Number(BigNumber.from(feeInfo1.hurdleRate)),//     5/100*10**18=5%
    Number(BigNumber.from(feeInfo1.lastAssetAmount))); //       

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
    await provider.send('evm_mine', []);
    
    const payoutCall = await performanceFeeHurdle.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager)
      .call();
    expect(payoutCall).toBe(true);

    const settleCall = await performanceFeeHurdle.settle
      .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData, 3)
      .from(mockFeeManager)
      .call();
    expect(settleCall).toMatchFunctionOutput(performanceFeeHurdle.settle, {
      settlementType_: feeSettlementType,
      assetAmountDue_: assetValueDue.abs(),
    });

    // update 
    // Execute update() tx
    const updateReceipt = await mockFeeManager.forward(
      performanceFeeHurdle.update,
      mockComptrollerProxy,
      mockVaultProxy,
      feeHook,
      settlementData,
      3,
    );

    // Assert event
    assertEvent(updateReceipt, 'LastAssetAmountUpdated', {
      comptrollerProxy: mockComptrollerProxy,
      prevAssetAmount: feeInfo.lastAssetAmount,
      nextAssetAmount,
    });
    await performanceFeeHurdle.update
      .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData, 3)
      .from(mockFeeManager)
      .call();

    const feeInfoUpdate = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    console.log("=====333 => ::", 
    Number(BigNumber.from(feeInfoUpdate.rate)),  
    Number(BigNumber.from(feeInfoUpdate.hurdleRate)),
    Number(BigNumber.from(feeInfoUpdate.lastAssetAmount)));
    // // Warp to the end of the period
    // await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
    // await provider.send('evm_mine', []);

    // // call() function to assert return value
    // const payoutCall = await performanceFeeHurdle.payout
    //   .args(mockComptrollerProxy, mockVaultProxy)
    //   .from(mockFeeManager)
    //   .call();

    // expect(payoutCall).toBe(true);

    // // send() function
    // const receipt = await mockFeeManager.forward(performanceFeeHurdle.payout, mockComptrollerProxy, mockVaultProxy);

    // // Assert event
    // assertEvent(receipt, 'PaidOut', {
    //   comptrollerProxy: mockComptrollerProxy,
    //   hurdleRate: hurdleRate,
    //   initialAssetValue: feeInfoPrePayout.lastAssetAmount,
    //   currentAssetValue: utils.parseEther('2'),
    // });

    // // Assert state
    // const getFeeInfoForFundCall = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
    // const payoutTimestamp = await transactionTimestamp(receipt);
    // expect(getFeeInfoForFundCall).toMatchFunctionOutput(performanceFeeHurdle.getFeeInfoForFund, {
    //   rate: feeInfoPrePayout.rate,
    //   period: feeInfoPrePayout.period,
    //   activated: feeInfoPrePayout.activated,
    //   lastPaid: BigNumber.from(payoutTimestamp), // updated
    //   hurdleRate: feeInfoPrePayout.hurdleRate, // updated
    //   lastAssetAmount: feeInfoPrePayout.lastAssetAmount,
    // });
  });
});
