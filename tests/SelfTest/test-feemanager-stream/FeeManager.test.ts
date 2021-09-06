import { extractEvent } from '@enzymefinance/ethers';
import {
  // IMigrationHookHandler,
  // MockVaultLib,
  // IFee,
  // settlePreBuySharesArgs,
  feeManagerConfigArgs,
  protocolFeesArgs,
  FeeSettlementType,
  // FeeHook,
  FeeManagerActionId,
  payoutSharesOutstandingForFeesArgs,
  // ProtocolFee,
  WETH,
  // StandardToken
} from '@taodao/protocol';
import {
  assertEvent,
  buyShares,
  callOnExtension,
  createNewFund,
  generateRegisteredMockFees,
  // assertNoEvent,
  deployProtocolFixture,
} from '@taodao/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const fees = await generateRegisteredMockFees({
    deployer,
    feeManager: deployment.feeManager,
  });

  const denominationAsset = new WETH(config.weth, deployer);
  console.log('====weth::', config.weth);
  console.log('====whales.weth::', whales.weth.address);

  // const denominationAsset = new StandardToken(config.primitives.usdc, deployer)
  // const denominationAsset1 = new WETH(config.weth, whales.weth);

  const createFund = () => {
    const feesSettingsData = [
      utils.randomBytes(10),
      utils.randomBytes(10),
      utils.randomBytes(2),
      constants.HashZero,
      utils.randomBytes(2),
    ];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: Object.values(fees),
      settings: feesSettingsData,
    });

    return createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: deployment.fundDeployer,
      denominationAsset,
      feeManagerConfig,
    });
  };

  return {
    accounts: remainingAccounts,
    deployer,
    config,
    deployment,
    fees,
    denominationAsset,
    fundOwner,
    createFund,
  };
}

describe('receiveCallFromComptroller', () => {
  it('calls the correct action for actionId', async () => {
    const {
      accounts: [fundInvestor],
      deployment: { feeManager },
      fees: { mockStreamingFeeSettle },
      createFund,
      fundOwner,
      denominationAsset,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const { comptrollerProxy } = await createFund();

    // Buy shares of the fund so that fees accrue
    await buyShares({
      comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // Direct mock continuous fee
    await mockStreamingFeeSettle.settle.returns(FeeSettlementType.Mint, constants.AddressZero, utils.parseEther('0.5'));

    // Settling the fee
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook, //0 = __invokeHook()
    });

    // _comptrollerProxy, _fee, settlementType, payer, payee, sharesDue
    // Check that the FeeSettledForFund event has been emitted
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    assertEvent(receipt, feeSettledForFundEvent, {
      settlementType: FeeSettlementType.Mint,
      comptrollerProxy,
      fee: mockStreamingFeeSettle,
      payer: constants.AddressZero,
      payee: fundOwner,
      sharesDue: utils.parseEther('0.5'),
    });
  });
});

describe('__payoutSharesOutstandingForFees', () => {
  it('pays out asset outstanding (if payable) and emits one event per payout', async () => {
    const {
      accounts: [buyer],
      deployment,
      fees: {
        mockContinuousFeeSettleOnly,
        mockStreamingFeeSettle,
        mockContinuousFeeWithGavAndUpdates,
        mockHurdleFeeSettle,
      },
      fundOwner,
      deployer,
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(buyer, investmentAmount);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // === Set ProtocolFee
    const feeDeposit = utils.parseEther('0.002'); //0.2%
    const feeWithdraw = utils.parseEther('0.005'); //0.5%
    const feePerform = utils.parseEther('0.08'); //8%
    const feeStream = utils.parseEther('0.005'); //0.5%
    const protocolFeeConfig = protocolFeesArgs({
      feeDeposit: feeDeposit,
      feeWithdraw: feeWithdraw,
      feePerform: feePerform,
      feeStream: feeStream,
    });

    // const protocolFeeInstance = await ProtocolFee.deploy(deployer, deployment.dispatcher);
    await deployment.protocolFee.connect(deployer).addFeeSettings(protocolFeeConfig);

    // Seed fund with initial fund shares,
    // to give a non-zero totalSupply (so that minting new shares is allowed)
    await buyShares({
      comptrollerProxy,
      denominationAsset,
      signer: buyer,
      buyers: [buyer],
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [0],
    });

    const unit = utils.parseEther('1');
    const preFundOwnerShareCall = await vaultProxy.balanceOf(fundOwner);
    const preShareOutstandingCall = await vaultProxy.balanceOf(vaultProxy);
    const investAssetAmount = await comptrollerProxy.getInvestAmount.args(denominationAsset).call();
    const gav_1 = (await comptrollerProxy.calcGav.args(true).call()).gav_;

    console.log(
      '=====after buyShares ::',
      Number(BigNumber.from(investmentAmount)), //10**18
      Number(BigNumber.from(await vaultProxy.balanceOf(buyer))), //0.998*10**18
      Number(BigNumber.from(await vaultProxy.totalSupply())), //0.998*10**18
      Number(BigNumber.from(preFundOwnerShareCall)), //0
      Number(BigNumber.from(preShareOutstandingCall)), //0
      Number(BigNumber.from(investAssetAmount)), //10**18
      Number(BigNumber.from(gav_1)),
    ); //0.998*10**18

    // Define both fees the same way, but with different fee amounts
    const shareManagement = utils.parseEther('0.1'); //10% managementFee
    await mockContinuousFeeSettleOnly.settle.returns(
      FeeSettlementType.MintSharesOutstanding,
      constants.AddressZero,
      shareManagement,
    );

    const shareStreaming = utils.parseEther('0.05'); //5% streamingFee
    await mockStreamingFeeSettle.settle.returns(
      FeeSettlementType.MintSharesOutstanding,
      constants.AddressZero,
      shareStreaming,
    );

    const shareHWM = utils.parseEther('0.2'); //20% HWM Fee
    const feeHWM = shareHWM.mul(feePerform).div(unit);
    const shareHWMWithFee = shareHWM.sub(feeHWM);
    await mockContinuousFeeWithGavAndUpdates.settle.returns(
      FeeSettlementType.MintSharesOutstanding,
      constants.AddressZero,
      shareHWM,
    );

    const shareHurdle = utils.parseEther('0.4'); //40% Hurdle Fee
    const feeHurdle = shareHurdle.mul(feePerform).div(unit);
    const shareHurdleWithFee = shareHurdle.sub(feeHurdle);
    await mockHurdleFeeSettle.settle.returns(
      FeeSettlementType.MintSharesOutstanding,
      constants.AddressZero,
      shareHurdle,
    );

    // Define param for all calls on extension
    const extension = deployment.feeManager;
    const fees = [
      mockContinuousFeeSettleOnly,
      mockStreamingFeeSettle,
      mockContinuousFeeWithGavAndUpdates,
      mockHurdleFeeSettle,
    ];

    // Settle once via callOnExtension to mint shares outstanding with no payout
    await callOnExtension({
      comptrollerProxy,
      extension,
      actionId: FeeManagerActionId.InvokeContinuousHook, //0 = __invokeHook()
    });

    // Set payout() to return true on both fees
    await mockContinuousFeeSettleOnly.payout.returns(true);
    await mockStreamingFeeSettle.payout.returns(true);
    await mockContinuousFeeWithGavAndUpdates.payout.returns(true);
    await mockHurdleFeeSettle.payout.returns(true);

    // Attempting to payout should not mint shares while `payout` returns false
    const actionId = FeeManagerActionId.PayoutSharesOutstandingForFees; //1 = __payoutSharesOutstandingForFees(),
    const callArgs = payoutSharesOutstandingForFeesArgs(fees); //

    // Payout fees
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension,
      actionId,
      callArgs,
    });

    const postFundOwnerShareCall = await vaultProxy.balanceOf(fundOwner);
    const postShareOutstandingCall = await vaultProxy.balanceOf(vaultProxy);
    console.log(
      '=====callOnExtension-3::',
      Number(BigNumber.from(preFundOwnerShareCall)), //0
      Number(BigNumber.from(postFundOwnerShareCall)), //1.1*10**18
      Number(BigNumber.from(preShareOutstandingCall)), //0
      Number(BigNumber.from(postShareOutstandingCall)),
    ); //0
    // One event should have been emitted for each fee
    const events = extractEvent(receipt, deployment.feeManager.abi.getEvent('SharesOutstandingPaidForFund'));
    expect(events.length).toBe(4);
    expect(events[0]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockContinuousFeeSettleOnly,
      sharesDue: shareManagement,
    });
    expect(events[1]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockStreamingFeeSettle,
      sharesDue: 0,
    });
    expect(events[2]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockContinuousFeeWithGavAndUpdates,
      sharesDue: shareHWMWithFee,
    });
    expect(events[3]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockHurdleFeeSettle,
      sharesDue: shareHurdleWithFee,
    });

    // 3 fees should be paid out to the fund owner
    const expectedShareOutstandingPaidFundOwner = shareManagement.add(shareHWMWithFee).add(shareHurdleWithFee);
    expect(postFundOwnerShareCall).toEqBigNumber(preFundOwnerShareCall.add(expectedShareOutstandingPaidFundOwner));

    const daoAddress = await deployment.protocolFee.getDaoAddress.args().call();
    const postProtocolShareCall = await vaultProxy.balanceOf(daoAddress);

    const expectedShareOutstandingPaidProtocol = shareStreaming.add(feeHWM).add(feeHurdle);
    expect(postProtocolShareCall).toEqBigNumber(preFundOwnerShareCall.add(expectedShareOutstandingPaidProtocol));

    const gav = (await comptrollerProxy.calcGav.args(true).call()).gav_;
    console.log(
      '=====gav ::',
      Number(BigNumber.from(await vaultProxy.balanceOf(buyer))), //0.998*10**18
      Number(BigNumber.from(await vaultProxy.totalSupply())), //10**18 + 0.748*10**18 = 1.748*10**18
      Number(BigNumber.from(postFundOwnerShareCall)), //0.652*10**18
      Number(BigNumber.from(postShareOutstandingCall)), //0
      Number(BigNumber.from(gav)),
    ); //0.998*10**18
    //=====fee-1:: 0.652000000000000000
    //=====fee-2:: 0.098000000000000000
  });
});
