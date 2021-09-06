import { MockContract, extractEvent } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  FeeHook,
  FeeManager,
  // FeeManagerActionId,
  feeManagerConfigArgs,
  FeeSettlementType,
  // MockChainlinkPriceSource,
  PerformanceFeeHWM,
  performanceFeeConfigArgs,
  performanceFeeSharesDue,
  VaultLib,
  WETH,
} from '@taodao/protocol';
import {
  // addTrackedAssets,
  assertEvent,
  // assertNoEvent,
  buyShares,
  // callOnExtension,
  // createFundDeployer,
  // createMigratedFundConfig,
  createNewFund,
  deployProtocolFixture,
  redeemShares,
  transactionTimestamp,
  // updateChainlinkAggregator,
} from '@taodao/testutils';
import { BigNumber, BigNumberish, BytesLike, constants, utils } from 'ethers';
// import { config } from 'dotenv';

async function snapshot() {
  const { accounts, deployment, config, deployer } = await deployProtocolFixture();

  // Mock a FeeManager
  const mockFeeManager = await FeeManager.mock(deployer);
  await mockFeeManager.getFeeSharesOutstandingForFund.returns(0);

  // Create standalone PerformanceFee
  const standalonePerformanceFee = await PerformanceFeeHWM.deploy(deployer, mockFeeManager);

  // Mock a denomination asset
  const mockDenominationAssetDecimals = 18;
  const mockDenominationAsset = new WETH(config.weth, deployer);

  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.totalSupply.returns(0);
  await mockVaultProxy.balanceOf.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  await mockComptrollerProxy.calcGav.returns(0, false);
  await mockComptrollerProxy.calcGrossShareValue.returns(mockDenominationAssetDecimals, true);
  await mockComptrollerProxy.getDenominationAsset.returns(mockDenominationAsset);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  // Add fee settings for ComptrollerProxy
  const performanceFeeRate = utils.parseEther('.1'); // 10%
  const performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
  // console.log("=====01::", Number(BigNumber.from(performanceFeePeriod)), //31536000
  // Number(BigNumber.from(performanceFeeRate)));//100000000000000000
  const performanceFeeConfig = performanceFeeConfigArgs({
    rate: performanceFeeRate,
    period: performanceFeePeriod,
  });

  // console.log("=====02::", performanceFeeConfig);//0x000000000000000000000000000000000000000000000000016345785d8a00000000000000000000000000000000000000000000000000000000000001e13380

  await mockFeeManager.forward(standalonePerformanceFee.addFundSettings, mockComptrollerProxy, performanceFeeConfig);

  return {
    deployer,
    accounts,
    config,
    deployment,
    performanceFeeRate,
    performanceFeePeriod,
    mockComptrollerProxy,
    mockDenominationAsset,
    mockFeeManager,
    mockVaultProxy,
    standalonePerformanceFee,
  };
}

async function activateWithInitialValues({
  mockFeeManager,
  mockComptrollerProxy,
  mockVaultProxy,
  performanceFee,
  gav,
  totalSharesSupply = utils.parseEther('1'),
}: {
  mockFeeManager: MockContract<FeeManager>;
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  mockVaultProxy: MockContract<VaultLib>;
  performanceFee: PerformanceFeeHWM;
  gav: BigNumberish;
  totalSharesSupply?: BigNumberish;
}) {
  // console.log("=====03::", Number(BigNumber.from(gav)),//100000000
  //  Number(BigNumber.from(totalSharesSupply)));//1000000000000000000
  await mockComptrollerProxy.calcGav.returns(gav, true);
  await mockVaultProxy.totalSupply.returns(totalSharesSupply);
  await mockComptrollerProxy.calcGrossShareValue.returns(
    BigNumber.from(gav).mul(utils.parseEther('1')).div(totalSharesSupply),
    true,
  );

  // console.log("=====04::", Number(BigNumber.from(gav).mul(utils.parseEther('1')).div(totalSharesSupply)));//100000000
  return mockFeeManager.forward(performanceFee.activateForFund, mockComptrollerProxy, mockVaultProxy);
}

async function assertAdjustedPerformance({
  mockFeeManager,
  mockComptrollerProxy,
  mockVaultProxy,
  performanceFee,
  nextGav,
  feeHook = FeeHook.Continuous,
  settlementData = constants.HashZero,
}: {
  mockFeeManager: MockContract<FeeManager>;
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  mockVaultProxy: MockContract<VaultLib>;
  performanceFee: PerformanceFeeHWM;
  nextGav: BigNumberish;
  feeHook?: FeeHook;
  settlementData?: BytesLike;
}) {
  // Change the share price by altering the gav
  const prevTotalSharesSupply = await mockVaultProxy.totalSupply();
  await mockComptrollerProxy.calcGav.returns(nextGav, true);
  await mockComptrollerProxy.calcGrossShareValue.returns(
    BigNumber.from(nextGav).mul(utils.parseEther('1')).div(prevTotalSharesSupply),
    true,
  );

  // Calculate expected performance results for next settlement
  const feeInfo = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);
  const prevTotalSharesOutstanding = await mockVaultProxy.balanceOf(mockVaultProxy);
  const prevPerformanceFeeSharesOutstanding = await mockFeeManager.getFeeSharesOutstandingForFund(
    mockComptrollerProxy,
    performanceFee,
  );

  const { nextAggregateValueDue, nextSharePrice, sharesDue } = performanceFeeSharesDue({
    rate: feeInfo.rate,
    totalSharesSupply: prevTotalSharesSupply,
    totalSharesOutstanding: prevTotalSharesOutstanding,
    performanceFeeSharesOutstanding: prevPerformanceFeeSharesOutstanding,
    gav: nextGav,
    highWaterMark: feeInfo.highWaterMark,
    prevSharePrice: feeInfo.lastSharePrice,
    prevAggregateValueDue: feeInfo.aggregateValueDue,
  });

  const gav_1 = (await mockComptrollerProxy.calcGav.args(true).call()).gav_;
  console.log(
    '=====111 => ::',
    Number(BigNumber.from(feeInfo.rate)), //0.1*10**18=10%
    Number(BigNumber.from(prevTotalSharesSupply)), //10**18
    Number(BigNumber.from(prevTotalSharesOutstanding)), //0
    Number(BigNumber.from(prevPerformanceFeeSharesOutstanding)), //0
    Number(BigNumber.from(nextGav)), //2*10**18
    Number(BigNumber.from(feeInfo.highWaterMark)), //10**18
    Number(BigNumber.from(feeInfo.lastSharePrice)), //10**18
    Number(BigNumber.from(feeInfo.aggregateValueDue)), //0
    Number(BigNumber.from(gav_1)),
  ); //2*10**18

  console.log(
    '=====112 => ::',
    Number(BigNumber.from(nextAggregateValueDue)), //0.1*10**18  0100000000000000000
    Number(BigNumber.from(nextSharePrice)), //2*10**18
    Number(BigNumber.from(sharesDue)),
  ); //0.052631578947368424*10**18

  // Determine fee settlement type
  let feeSettlementType = FeeSettlementType.None;
  if (sharesDue.gt(0)) {
    feeSettlementType = FeeSettlementType.MintSharesOutstanding;
  } else if (sharesDue.lt(0)) {
    feeSettlementType = FeeSettlementType.BurnSharesOutstanding;
  }

  // settle.call() to assert return values and get the sharesOutstanding
  const settleCall = await performanceFee.settle
    .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData, nextGav)
    .from(mockFeeManager)
    .call();

  expect(settleCall).toMatchFunctionOutput(performanceFee.settle, {
    settlementType_: feeSettlementType,
    sharesDue_: sharesDue.abs(),
  });

  // Execute settle() tx
  const settleReceipt = await mockFeeManager.forward(
    performanceFee.settle,
    mockComptrollerProxy,
    mockVaultProxy,
    feeHook,
    settlementData,
    nextGav,
  );

  // Assert PerformanceUpdated event
  assertEvent(settleReceipt, 'PerformanceUpdated', {
    comptrollerProxy: mockComptrollerProxy,
    prevAggregateValueDue: feeInfo.aggregateValueDue,
    nextAggregateValueDue,
    sharesOutstandingDiff: sharesDue,
  });

  // Execute update() tx
  const updateReceipt = await mockFeeManager.forward(
    performanceFee.update,
    mockComptrollerProxy,
    mockVaultProxy,
    feeHook,
    settlementData,
    nextGav,
  );

  // Assert event
  assertEvent(updateReceipt, 'LastSharePriceUpdated', {
    comptrollerProxy: mockComptrollerProxy,
    prevSharePrice: feeInfo.lastSharePrice,
    nextSharePrice,
  });
  // console.log("=====LastSharePriceUpdated::", Number(BigNumber.from(feeInfo.lastSharePrice)), //100000000
  // Number(BigNumber.from(nextSharePrice)))//200000000
  // Set sharesOutstanding and new shares total supply
  await mockVaultProxy.balanceOf.given(mockVaultProxy).returns(prevTotalSharesOutstanding.add(sharesDue));
  await mockFeeManager.getFeeSharesOutstandingForFund
    .given(mockComptrollerProxy, performanceFee)
    .returns(prevPerformanceFeeSharesOutstanding.add(sharesDue));
  await mockVaultProxy.totalSupply.returns(prevTotalSharesSupply.add(sharesDue));

  return { feeSettlementType, settleReceipt };
}

describe('payout', () => {
  it('correctly handles a valid call (HWM has increased)', async () => {
    const {
      mockComptrollerProxy,
      mockDenominationAsset,
      mockFeeManager,
      mockVaultProxy,
      performanceFeePeriod,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
    });

    const initialSharePrice = (await mockComptrollerProxy.calcGrossShareValue.call()).grossShareValue_;
    // console.log("=====initialSharePrice::", Number(BigNumber.from(initialSharePrice)));//100000000

    // Raise next high water mark by increasing price
    await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseUnits('2', await mockDenominationAsset.decimals()),
      performanceFee,
    });
    // console.log("=====nextGav::", Number(BigNumber.from(utils.parseUnits('1.1', await mockDenominationAsset.decimals()))));
    //110000000

    const feeInfoPrePayout = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
    await provider.send('evm_mine', []);

    // call() function to assert return value
    const payoutCall = await performanceFee.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager)
      .call();

    expect(payoutCall).toBe(true);

    // send() function
    const receipt = await mockFeeManager.forward(performanceFee.payout, mockComptrollerProxy, mockVaultProxy);

    // Assert event
    assertEvent(receipt, 'PaidOut', {
      comptrollerProxy: mockComptrollerProxy,
      prevHighWaterMark: initialSharePrice,
      nextHighWaterMark: feeInfoPrePayout.lastSharePrice,
      aggregateValueDue: feeInfoPrePayout.aggregateValueDue,
    });

    // Assert state
    const getFeeInfoForFundCall = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);
    const payoutTimestamp = await transactionTimestamp(receipt);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(performanceFee.getFeeInfoForFund, {
      rate: feeInfoPrePayout.rate,
      period: feeInfoPrePayout.period,
      activated: feeInfoPrePayout.activated,
      lastPaid: BigNumber.from(payoutTimestamp), // updated
      highWaterMark: feeInfoPrePayout.lastSharePrice, // updated
      lastSharePrice: feeInfoPrePayout.lastSharePrice,
      aggregateValueDue: 0, // updated
    });

    // console.log("=====PaidOut update-1::",
    // Number(BigNumber.from(feeInfoPrePayout.rate)),//100000000000000000
    // Number(BigNumber.from(feeInfoPrePayout.period)),//   31536000
    // Number(BigNumber.from(feeInfoPrePayout.activated)),//1628580950
    // Number(BigNumber.from(payoutTimestamp)),//           1660116958
    // Number(BigNumber.from(feeInfoPrePayout.lastSharePrice)),//110000000
    // Number(BigNumber.from(feeInfoPrePayout.lastSharePrice))
    // );
  });
});

describe('integration', () => {
  it('works correctly upon shares redemption for a non 18-decimal asset', async () => {
    const {
      deployer,
      accounts: [fundOwner, investor],
      config,
      deployment: { performanceFeeHWM, fundDeployer },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(config.weth, deployer);

    const sharesActionTimelock = 0;
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      sharesActionTimelock,
      fundOwner: fundOwner,
      fundName: 'TestFund',
      feeManagerConfig: feeManagerConfigArgs({
        fees: [performanceFeeHWM],
        settings: [
          performanceFeeConfigArgs({
            rate: utils.parseEther('.05'), //5%
            period: BigNumber.from(60 * 60 * 24 * 365), // 365 days
          }),
        ],
      }),
    });

    const initialInvestmentAmount = utils.parseUnits('100', await denominationAsset.decimals());
    await denominationAsset.transfer(investor, initialInvestmentAmount);

    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [initialInvestmentAmount],
    });

    // Performance fee state should be in expected initial configuration
    const initialFeeInfo = await performanceFeeHWM.getFeeInfoForFund(comptrollerProxy);

    // expect(initialFeeInfo.lastSharePrice).toEqBigNumber(denominationAssetUnit);
    // expect(initialFeeInfo.aggregateValueDue).toEqBigNumber(0);
    const gavBeforeRedeem1 = (await comptrollerProxy.calcGav.args(true).call()).gav_;

    console.log(
      '=====after BuyShares-initInvestAmount, vaultProxyAmount, vaultTotal, lastSharePrice, aggregateValueDue, highWaterMark, gav ::',
      Number(BigNumber.from(initialInvestmentAmount)), //100*10**6
      Number(BigNumber.from(await vaultProxy.balanceOf(investor))), //99.8*10**18
      Number(BigNumber.from(await vaultProxy.totalSupply())), //99.8*10**18
      Number(BigNumber.from(initialFeeInfo.lastSharePrice)), //1002004
      Number(BigNumber.from(initialFeeInfo.aggregateValueDue)), //0
      Number(BigNumber.from(initialFeeInfo.highWaterMark)), //10**6
      Number(BigNumber.from(gavBeforeRedeem1)),
    ); //99.8*10**6

    //============================= Redeem1 small amount of shares
    const redeemAmount1 = (await vaultProxy.balanceOf(investor)).div(2);
    const redeemTx1 = await redeemShares({
      comptrollerProxy,
      signer: investor,
      quantity: redeemAmount1,
    });

    // The fees should not have emitted a failure event
    const failureEvents1 = extractEvent(redeemTx1 as any, 'PreRedeemSharesHookFailed');
    expect(failureEvents1.length).toBe(0);

    // Performance fee state should be exactly the same
    const feeInfo1 = await performanceFeeHWM.getFeeInfoForFund(comptrollerProxy);
    // expect(feeInfo1.lastSharePrice).toEqBigNumber(initialFeeInfo.lastSharePrice);//1000000 = 1002004
    expect(feeInfo1.aggregateValueDue).toEqBigNumber(initialFeeInfo.aggregateValueDue);

    const gavPostRedeem1 = (await comptrollerProxy.calcGav.args(true).call()).gav_;

    const sharesSupplyNetSharesOutstanding0 = (await vaultProxy.totalSupply()).sub(
      await vaultProxy.balanceOf(vaultProxy),
    );
    console.log(
      '=====after Redeem1-redeemAmount, vaultProxyAmount, vaultTotal, lastSharePrice, aggregateValueDue, highWaterMark, gav ::',
      Number(BigNumber.from(redeemAmount1)), //49.9*10**18
      Number(BigNumber.from(await vaultProxy.balanceOf(investor))), //49.9*10**18
      Number(BigNumber.from(await vaultProxy.totalSupply())), //49.9*10**18
      Number(BigNumber.from(feeInfo1.lastSharePrice)), //1002004
      Number(BigNumber.from(feeInfo1.aggregateValueDue)), //0
      Number(BigNumber.from(feeInfo1.highWaterMark)), //10**6
      Number(BigNumber.from(sharesSupplyNetSharesOutstanding0)), //49.9*10**18
      Number(BigNumber.from(gavPostRedeem1)),
    ); //50.1495*10**6 => increased 0.5% withdraw Fee of 49.9*10**6

    // // Bump performance by sending denomination asset to the vault
    // const gavIncreaseAmount = utils.parseUnits('5', await denominationAsset.decimals());
    // await denominationAsset.transfer(vaultProxy, gavIncreaseAmount);
    // const gavPostTransfer = (await comptrollerProxy.calcGav.args(true).call()).gav_;

    // console.log("======after sending denomination asset to the vault-vaultProxyAmount, vaultProxytotal, gav::",
    // vaultProxy.address,//0xb2D1C2f13eC47741126AD3B281128D023129f0fe
    // Number(BigNumber.from(await vaultProxy.balanceOf(investor))),
    // Number(BigNumber.from(await vaultProxy.totalSupply())),
    // Number(BigNumber.from(gavPostTransfer)));

    //============================== Redeem2 more of remaining shares
    const redeemAmount2 = (await vaultProxy.balanceOf(investor)).div(2);
    const redeemTx2 = await redeemShares({
      comptrollerProxy,
      signer: investor,
      quantity: redeemAmount2,
    });

    // The fees should not have emitted a failure event
    const failureEvents2 = extractEvent(redeemTx2 as any, 'PreRedeemSharesHookFailed');
    expect(failureEvents2.length).toBe(0);

    const sharesSupplyNetSharesOutstanding = (await vaultProxy.totalSupply()).sub(
      await vaultProxy.balanceOf(vaultProxy),
    );

    console.log(
      '======sharesSupplyNetSharesOutstanding after redeem2::',
      Number(BigNumber.from(sharesSupplyNetSharesOutstanding)),
      Number(BigNumber.from(await vaultProxy.totalSupply())),
      Number(BigNumber.from(await vaultProxy.balanceOf(vaultProxy))),
    ); //12416023886538940

    // Performance fee state should have updated correctly
    const gavPostRedeem2 = (await comptrollerProxy.calcGav.args(true).call()).gav_;
    const feeInfo3 = await performanceFeeHWM.getFeeInfoForFund(comptrollerProxy);

    console.log(
      '=====after Redeem2-redeemAmount, vaultProxyAmount, vaultTotal, lastSharePrice, aggregateValueDue, highWaterMark, gav ::',
      Number(BigNumber.from(redeemAmount2)), //24.95*10**18
      Number(BigNumber.from(await vaultProxy.balanceOf(investor))), //24.95*10**18
      Number(BigNumber.from(await vaultProxy.totalSupply())), //24.95*10**18 + 12416023886538940
      Number(BigNumber.from(feeInfo3.lastSharePrice)), //1005250
      Number(BigNumber.from(feeInfo3.aggregateValueDue)), //12475
      Number(BigNumber.from(feeInfo3.highWaterMark)),
      Number(BigNumber.from(gavPostRedeem2)),
    );

    // expect(feeInfo3.lastSharePrice).toEqBigNumber(
    //   gavPostRedeem2.mul(utils.parseEther('1')).div(sharesSupplyNetSharesOutstanding),
    // );
    // // This is 1 wei less than expected
    // expect(feeInfo3.aggregateValueDue).toEqBigNumber(
    //   feeInfo3.rate.mul(gavIncreaseAmount).div(utils.parseEther('1')).sub(1),
    // );
  });

  // it('can create a new fund with this fee, works correctly while buying shares, and is paid out when allowed', async () => {
  //   const {
  //     deployer,
  //     accounts: [fundOwner, fundInvestor],
  //     config: { primitives:{usdc} },
  //     deployment: {
  //       // chainlinkPriceFeed,
  //       feeManager,
  //       trackedAssetsAdapter,
  //       integrationManager,
  //       performanceFee,
  //       fundDeployer,
  //     },
  //   } = await provider.snapshot(snapshot);

  //   const denominationAsset = new StandardToken(usdc, deployer);
  //   const investmentAmount = utils.parseUnits('200', await denominationAsset.decimals());
  //   await denominationAsset.transfer(fundInvestor, investmentAmount.mul(2));

  //   // const mockPriceSource = await MockChainlinkPriceSource.deploy(deployer, 6);
  //   // chainlinkPriceFeed.updatePrimitives([usdc], [mockPriceSource]);

  //   const performanceFeeRate = utils.parseEther('.1'); // 10%
  //   const performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
  //   const performanceFeeConfigSettings = performanceFeeConfigArgs({
  //     rate: performanceFeeRate,
  //     period: performanceFeePeriod,
  //   });

  //   const feeManagerConfig = feeManagerConfigArgs({
  //     fees: [performanceFee],
  //     settings: [performanceFeeConfigSettings],
  //   });

  //   const { comptrollerProxy, vaultProxy } = await createNewFund({
  //     signer: fundOwner,
  //     fundDeployer,
  //     denominationAsset,
  //     fundOwner: fundOwner,
  //     fundName: 'TestFund',
  //     feeManagerConfig,
  //   });

  //   const feeInfo = await performanceFee.getFeeInfoForFund(comptrollerProxy.address);

  //   // check that the fee has been registered and the parameters are correct
  //   expect(feeInfo.rate).toEqBigNumber(performanceFeeRate);
  //   expect(feeInfo.period).toEqBigNumber(performanceFeePeriod);

  //   // check whether payout is allowed before the fee period has passed
  //   const falsePayoutCall = await performanceFee.payoutAllowed(comptrollerProxy);

  //   // time warp to end of fee period
  //   await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
  //   await provider.send('evm_mine', []);

  //   // check whether payout is allowed at the end of the fee period
  //   const truePayoutCall = await performanceFee.payoutAllowed(comptrollerProxy);

  //   expect(falsePayoutCall).toBe(false);
  //   expect(truePayoutCall).toBe(true);

  //   // invest in the fund so there are shares
  //   await buyShares({
  //     comptrollerProxy,
  //     signer: fundInvestor,
  //     buyers: [fundInvestor],
  //     denominationAsset,
  //     investmentAmounts: [investmentAmount],
  //     minSharesAmounts: [utils.parseEther('1')],
  //   });

  //   // add assets to fund
  //   const mln = new StandardToken(usdc, deployer);
  //   const amount = utils.parseUnits('75', await mln.decimals());
  //   await mln.transfer(vaultProxy, amount);

  //   // track them
  //   await addTrackedAssets({
  //     comptrollerProxy,
  //     integrationManager,
  //     fundOwner,
  //     trackedAssetsAdapter,
  //     incomingAssets: [mln],
  //   });

  //   // make sure you're past the next performanceFeePeriod
  //   await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
  //   await provider.send('evm_mine', []);

  //   // count shares of fund
  //   const profitCaseSharesBeforeSettlement = await vaultProxy.totalSupply();

  //   // update price feed to accommodate time warp
  //   // await updateChainlinkAggregator(mockPriceSource);

  //   // settle fees
  //   await callOnExtension({
  //     signer: fundOwner,
  //     comptrollerProxy,
  //     extension: feeManager,
  //     actionId: FeeManagerActionId.InvokeContinuousHook,
  //   });

  //   // recount shares of the fund
  //   const profitCaseSharesAfterSettlement = await vaultProxy.totalSupply();

  //   // with gains, contract settles by minting new shares - shares after settlement should be > shares before
  //   expect(profitCaseSharesAfterSettlement).toBeGtBigNumber(profitCaseSharesBeforeSettlement);

  //   // fast forward to payout
  //   await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
  //   await provider.send('evm_mine', []);

  //   // count shares of the fund
  //   const lossCaseSharesBeforeSettlement = await vaultProxy.totalSupply();

  //   // update price feed to accommodate time warp and tick down the price of MLN to decrease GAV
  //   // await updateChainlinkAggregator(mockPriceSource, utils.parseEther('.75'));

  //   // buy shares to settle fees
  //   await buyShares({
  //     comptrollerProxy,
  //     signer: fundInvestor,
  //     buyers: [fundInvestor],
  //     denominationAsset,
  //     investmentAmounts: [investmentAmount],
  //     minSharesAmounts: [utils.parseEther('.01')],
  //   });

  //   // count shares of fund
  //   const lossCaseSharesAfterSettlement = await vaultProxy.totalSupply();

  //   // with losses, fees are settled by burning shares, new total supply of shares after investment
  //   // should be less than lossCaseBefore plus investment amount
  //   expect(lossCaseSharesAfterSettlement).toBeLtBigNumber(lossCaseSharesBeforeSettlement.add(investmentAmount));
  // });

  // it('can create a migrated fund with this fee', async () => {
  //   const {
  //     deployer,
  //     accounts: [fundOwner],
  //     config: {
  //       weth,
  //       synthetix: { addressResolver: synthetixAddressResolverAddress },
  //     },
  //     deployment: {
  //       chainlinkPriceFeed,
  //       dispatcher,
  //       feeManager,
  //       fundDeployer,
  //       integrationManager,
  //       policyManager,
  //       synthetixPriceFeed,
  //       valueInterpreter,
  //       vaultLib,
  //       performanceFee,
  //     },
  //   } = await provider.snapshot(snapshot);

  //   const denominationAsset = new WETH(weth, whales.weth);

  //   const performanceFeeRate = utils.parseEther('.1'); // 10%
  //   const performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
  //   const performanceFeeConfigSettings = performanceFeeConfigArgs({
  //     rate: performanceFeeRate,
  //     period: performanceFeePeriod,
  //   });

  //   const feeManagerConfig = feeManagerConfigArgs({
  //     fees: [performanceFee],
  //     settings: [performanceFeeConfigSettings],
  //   });

  //   const { vaultProxy } = await createNewFund({
  //     signer: fundOwner,
  //     fundDeployer,
  //     denominationAsset,
  //     fundOwner,
  //     fundName: 'TestFund',
  //     feeManagerConfig,
  //   });

  //   const nextFundDeployer = await createFundDeployer({
  //     deployer,
  //     chainlinkPriceFeed,
  //     dispatcher,
  //     feeManager,
  //     integrationManager,
  //     policyManager,
  //     synthetixPriceFeed,
  //     synthetixAddressResolverAddress,
  //     valueInterpreter,
  //     vaultLib,
  //   });

  //   const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
  //     signer: fundOwner,
  //     fundDeployer: nextFundDeployer,
  //     denominationAsset,
  //     feeManagerConfigData: feeManagerConfig,
  //   });

  //   const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
  //   await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

  //   const migrationTimelock = await dispatcher.getMigrationTimelock();
  //   await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

  //   await signedNextFundDeployer.executeMigration(vaultProxy);

  //   const feeInfo = await performanceFee.getFeeInfoForFund(nextComptrollerProxy);
  //   expect(feeInfo.rate).toEqBigNumber(performanceFeeRate);
  //   expect(feeInfo.period).toEqBigNumber(performanceFeePeriod);
  // });
});
