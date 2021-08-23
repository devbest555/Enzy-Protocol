import { AddressLike, extractEvent, MockContract, randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  FeeHook,
  FeeManager,
  FeeManagerActionId,
  feeManagerConfigArgs,
  FeeSettlementType,
  MockChainlinkPriceSource,
  PerformanceFeeHurdle,
  hurdleConfigArgs,
  performanceFeeAssetDue,
  StandardToken,
  VaultLib,
  WETH,
} from '@taodao/protocol';
import {
  addTrackedAssets,
  assertEvent,
  buyShares,
  callOnExtension,
  createFundDeployer,
  createNewFund,
  deployProtocolFixture,
  redeemShares,
  transactionTimestamp,
  updateChainlinkAggregator,
} from '@enzymefinance/testutils';
import { BigNumber, BigNumberish, BytesLike, constants, utils } from 'ethers';

async function snapshot() {
  const { accounts, deployment, config, deployer,
    config: {
      primitives: { usdc },
    },
  } = await deployProtocolFixture();

  const initAssetAmount = utils.parseEther('1');
  const curAssetAmount = utils.parseEther('2');

  // Mock a FeeManager
  const mockFeeManager = await FeeManager.mock(deployer);

  // Create standalone PerformanceFee
  const performanceFeeHurdle = await PerformanceFeeHurdle.deploy(deployer, mockFeeManager);

  // Mock a denomination asset
  const mockDenominationAsset = new StandardToken(usdc, deployer);

  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.totalSupply.returns(0);
  await mockVaultProxy.balanceOf.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  await mockComptrollerProxy.getDenominationAsset.returns(mockDenominationAsset);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);
  
  // Add fee settings for ComptrollerProxy
  const performanceFeeRate = utils.parseUnits('.1', await mockDenominationAsset.decimals()); // 10%
  const hurdleRate = utils.parseUnits('.05', await mockDenominationAsset.decimals()); // 5%
  const performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
  const performanceFeeConfig = hurdleConfigArgs({
    rate: performanceFeeRate,
    period: performanceFeePeriod,
    hurdleRate: hurdleRate
  });

  await mockFeeManager.forward(performanceFeeHurdle.addFundSettings, mockComptrollerProxy, performanceFeeConfig);

  return {
    deployer,
    accounts,
    config,
    deployment,
    performanceFeeRate,
    performanceFeePeriod,
    hurdleRate,
    mockComptrollerProxy,
    mockDenominationAsset,
    mockFeeManager,
    mockVaultProxy,
    initAssetAmount,
    curAssetAmount,
    performanceFeeHurdle
  };
}

async function assertAdjustedPerformance({
  mockFeeManager,
  mockComptrollerProxy,
  mockVaultProxy,
  performanceFeeHurdle,
  nextAssetAmount,
  denominationAsset,
  feeHook = FeeHook.Continuous,
  settlementData = constants.HashZero,
}: {
  mockFeeManager: MockContract<FeeManager>;
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  mockVaultProxy: MockContract<VaultLib>;
  performanceFeeHurdle: PerformanceFeeHurdle;
  nextAssetAmount: BigNumberish;
  denominationAsset: StandardToken;
  feeHook?: FeeHook;
  settlementData?: BytesLike;
}) {
  // Change the share price by altering the gav
  // const prevTotalSharesSupply = await mockVaultProxy.totalSupply();
  
  await mockComptrollerProxy.calcEachBalance.returns(nextAssetAmount);

  // Calculate expected performance results for next settlement
  const feeInfo = await performanceFeeHurdle.getFeeInfoForFund(mockComptrollerProxy);
  const assetValueDue = performanceFeeAssetDue({
    rate: feeInfo.rate,
    hurdleRate: feeInfo.hurdleRate,
    denominationAsset: denominationAsset,
    currentAssetValue: nextAssetAmount,
    initialAssetValue: utils.parseEther('1'),
  });
  
  console.log("=====111 => ::", 
  Number(BigNumber.from(feeInfo.rate)),//           10**17=10%   
  Number(BigNumber.from(feeInfo.hurdleRate)),//     5/100*10**18=5%
  Number(BigNumber.from(feeInfo.lastSharePrice)),// 10**18
  Number(BigNumber.from(assetValueDue))); //                


  // Determine fee settlement type
  let feeSettlementType = FeeSettlementType.None;
  if (assetValueDue.gt(0)) {
    feeSettlementType = FeeSettlementType.Direct;
  } 
  console.log("=====feeSettlementType::", feeSettlementType);

  // settle.call() to assert return values and get the sharesOutstanding
  const settleCall = await performanceFeeHurdle.settle
    .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData, 1)
    .from(mockFeeManager)
    .call();

  expect(settleCall).toMatchFunctionOutput(performanceFeeHurdle.settle, {
    settlementType_: feeSettlementType,
    sharesDue_: assetValueDue.abs(),
  });

  // Execute settle() tx
  const settleReceipt = await mockFeeManager.forward(
    performanceFeeHurdle.settle,
    mockComptrollerProxy,
    mockVaultProxy,
    feeHook,
    settlementData,
    1,
  );

  // Assert PerformanceUpdated event
  assertEvent(settleReceipt, 'PerformanceUpdated', {
    comptrollerProxy: mockComptrollerProxy,
    assetValueDue: assetValueDue,
    currentAssetValue: utils.parseEther('2'),
    initialAssetValue: utils.parseEther('1'),
  });

  return { feeSettlementType, settleReceipt };
}

describe('integration', () => {
  it('works correctly upon shares redemption for a non 18-decimal asset', async () => {
    const {
      accounts: [fundOwner, investor],
      config: {
        primitives: { usdc },
      },
      deployment: { performanceFeeHurdle, fundDeployer },
      deployer,
    } = await provider.snapshot(snapshot);

    const denominationAsset = new StandardToken(usdc, deployer);

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner: fundOwner,
      fundName: 'TestFund',
      feeManagerConfig: feeManagerConfigArgs({
        fees: [performanceFeeHurdle],
        settings: [
          hurdleConfigArgs({
            rate: utils.parseUnits('.1', await denominationAsset.decimals()),// 10 %
            period: BigNumber.from(60 * 60 * 24 * 31), // 31 days
            hurdleRate:utils.parseUnits('.05', await denominationAsset.decimals()),// 5 %
          }),
        ],
      }),
    });

    const initialInvestmentAmount = utils.parseUnits('2', await denominationAsset.decimals());
    await denominationAsset.transfer(investor, initialInvestmentAmount);
    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [initialInvestmentAmount],
    });

    
    // Performance fee state should be in expected initial configuration
    const initialFeeInfo = await performanceFeeHurdle.getFeeInfoForFund(comptrollerProxy);
    console.log("=======initialFeeInfo::", 
    Number(BigNumber.from(initialFeeInfo.rate)),//10**17 = 10%
    Number(BigNumber.from(initialFeeInfo.period)),//1 year
    Number(BigNumber.from(initialFeeInfo.activated)),//1629718184
    Number(BigNumber.from(initialFeeInfo.lastPaid)),//0
    Number(BigNumber.from(initialFeeInfo.hurdleRate)),//0.05*10**18
    Number(BigNumber.from(initialFeeInfo.lastSharePrice)));//2*10**6

    // Redeem small amount of shares
    const redeemTx1 = await redeemShares({
      comptrollerProxy,
      signer: investor,
      quantity: initialInvestmentAmount.div(4),
    });

    // The fees should not have emitted a failure event
    const failureEvents1 = extractEvent(redeemTx1 as any, 'PreRedeemSharesHookFailed');
    console.log("=====failureEvents1::", failureEvents1);

    // Performance fee state should be exactly the same
    const feeInfo2 = await performanceFeeHurdle.getFeeInfoForFund(comptrollerProxy);
    console.log("=======feeInfo2::", 
    Number(BigNumber.from(feeInfo2.rate)),//10**17 = 10%
    Number(BigNumber.from(feeInfo2.period)),//1 year
    Number(BigNumber.from(feeInfo2.activated)),//1629718184
    Number(BigNumber.from(feeInfo2.lastPaid)),//0
    Number(BigNumber.from(feeInfo2.hurdleRate)),//0.05*10**18
    Number(BigNumber.from(feeInfo2.lastSharePrice)));//2*10**6

  });

});
