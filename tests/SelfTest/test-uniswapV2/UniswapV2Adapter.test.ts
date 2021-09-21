import { MockContract, extractEvent } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  FeeHook,
  FeeManager,
  FeeManagerActionId,
  feeManagerConfigArgs,
  FeeSettlementType,
  MockChainlinkPriceSource,
  hurdleConfigArgs,
  StandardToken,
  VaultLib,
  WETH,
  PerformanceFeeHurdle,
  hurdleSharesDue,
  IntegrationManager,
} from '@taodao/protocol';
import {
  addTrackedAssets,
  assertEvent,
  //   assertNoEvent,
  buyShares,
  callOnExtension,
  //   createFundDeployer,
  //   createMigratedFundConfig,
  createNewFund,
  deployProtocolFixture,
  redeemShares,
  transactionTimestamp,
  // updateChainlinkAggregator,
} from '@taodao/testutils';
import { BigNumber, BigNumberish, BytesLike, constants, utils } from 'ethers';
import { config } from 'dotenv';

async function snapshot() {
  const { accounts, deployment, config, deployer } = await deployProtocolFixture();

  // Mock a FeeManager
  const mockFeeManager = await FeeManager.mock(deployer);
  await mockFeeManager.getFeeSharesOutstandingForFund.returns(0);

  // Create standalone PerformanceFee
  const standalonePerformanceFee = await PerformanceFeeHurdle.deploy(deployer, mockFeeManager);

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
  const hurdleRate = utils.parseEther('.05'); // 5%
  // console.log("=====01::", Number(BigNumber.from(performanceFeePeriod)), //31536000
  // Number(BigNumber.from(performanceFeeRate)));//100000000000000000
  const performanceFeeConfig = hurdleConfigArgs({
    rate: performanceFeeRate,
    period: performanceFeePeriod,
    hurdleRate: hurdleRate,
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

describe('integration', () => {
  it('works correctly upon shares redemption for a non 18-decimal asset', async () => {
    const {
      deployer,
      accounts: [fundOwner, investor],
      config,
      deployment: { performanceFeeHurdle, fundDeployer, uniswapV2Adapter, integrationManager },
    } = await provider.snapshot(snapshot);

    const denominationAsset = new WETH(config.weth, whales.weth);

    const sharesActionTimelock = 0;
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      sharesActionTimelock,
      fundOwner: fundOwner,
      fundName: 'TestFund',
      feeManagerConfig: feeManagerConfigArgs({
        fees: [performanceFeeHurdle],
        settings: [
          hurdleConfigArgs({
            rate: utils.parseEther('.1'), //10%
            period: BigNumber.from(60 * 60 * 24 * 365), // 365 days
            hurdleRate: utils.parseEther('.05'), //5%
          }),
        ],
      }),
    });

    const initialInvestmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundOwner, initialInvestmentAmount);

    await buyShares({
      comptrollerProxy,
      signer: fundOwner,
      buyers: [fundOwner],
      denominationAsset,
      investmentAmounts: [initialInvestmentAmount],
    });

    const extension = integrationManager;

    console.log("===========investor::", investor.address, comptrollerProxy.address, fundOwner.address, fundDeployer.address);
    // Settle once via callOnExtension to mint shares outstanding with no payout
    await comptrollerProxy.callOnExtension(extension, 0, "0x");
    // await callOnExtension({
    //   comptrollerProxy,
    //   extension,
    //   actionId: FeeManagerActionId.InvokeContinuousHook,
    // });


    //============================= Redeem1 small amount of shares
    // await comptrollerProxy.connect(fundOwner).redeemSharesToDenom(uniswapV2Adapter);
    console.log("===========ok");
    // const redeemTx1 = await redeemShares({
    //   comptrollerProxy,
    //   signer: investor,
    //   quantity: redeemAmount1,
    // });
  });
});
