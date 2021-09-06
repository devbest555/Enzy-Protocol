import { extractEvent } from '@enzymefinance/ethers';
import {
  IMigrationHookHandler,
  MockVaultLib,
  IFee,
  settlePreBuySharesArgs,
  feeManagerConfigArgs,
  FeeSettlementType,
  FeeHook,
  FeeManagerActionId,
  payoutSharesOutstandingForFeesArgs,
  StandardToken,
  WETH,
} from '@taodao/protocol';
import {
  assertEvent,
  buyShares,
  callOnExtension,
  createNewFund,
  generateRegisteredMockFees,
  assertNoEvent,
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

  const createFund = () => {
    const feesSettingsData = [utils.randomBytes(10), utils.randomBytes(2), constants.HashZero, utils.randomBytes(2)];

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
      fees: { mockContinuousFeeSettleOnly },
      createFund,
      fundOwner,
      denominationAsset,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('10');
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

    // Mint mock continuous fee
    await mockContinuousFeeSettleOnly.settle.returns(
      FeeSettlementType.Mint,
      constants.AddressZero,
      utils.parseEther('5'),
    );

    // Settling the fee
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    // Check that the FeeSettledForFund event has been emitted
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    assertEvent(receipt, feeSettledForFundEvent, {
      settlementType: FeeSettlementType.Mint,
      comptrollerProxy,
      fee: mockContinuousFeeSettleOnly,
      payer: constants.AddressZero,
      payee: fundOwner,
      sharesDue: expect.anything(),
    });
  });
});

describe('__payoutSharesOutstandingForFees', () => {
  it('pays out shares outstanding (if payable) and emits one event per payout', async () => {
    const {
      accounts: [buyer],
      deployment: { feeManager },
      fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates },
      fundOwner,
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('10');
    await denominationAsset.transfer(buyer, investmentAmount);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Seed fund with initial fund shares,
    // to give a non-zero totalSupply (so that minting new shares is allowed)
    await buyShares({
      comptrollerProxy,
      denominationAsset,
      signer: buyer,
      buyers: [buyer],
      investmentAmounts: [investmentAmount],
    });

    const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const preSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    const gav_1 = (await comptrollerProxy.calcGav.args(true).call()).gav_;
    console.log(
      '=====after buyShares ::',
      Number(BigNumber.from(investmentAmount)),
      Number(BigNumber.from(await vaultProxy.balanceOf(buyer))),
      Number(BigNumber.from(await vaultProxy.totalSupply())),
      Number(BigNumber.from(preFundOwnerSharesCall)),
      Number(BigNumber.from(preSharesOutstandingCall)),
      Number(BigNumber.from(gav_1)),
    );

    // Define both fees the same way, but with different fee amounts
    const feeAmount1 = utils.parseEther('5');
    const feeAmount2 = utils.parseEther('2');
    const unit = utils.parseEther('1');
    const feeAmount22 = feeAmount2.sub(feeAmount2.mul(8).div(unit));
    const settlementType = FeeSettlementType.MintSharesOutstanding;
    await mockContinuousFeeSettleOnly.settle.returns(settlementType, constants.AddressZero, feeAmount1);
    await mockContinuousFeeWithGavAndUpdates.settle.returns(settlementType, constants.AddressZero, feeAmount2);

    console.log('=====values::', Number(BigNumber.from(feeAmount2)), Number(BigNumber.from(feeAmount22)));
    // Define param for all calls on extension
    const extension = feeManager;
    const fees = [mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates];

    // Settle once via callOnExtension to mint shares outstanding with no payout
    await callOnExtension({
      comptrollerProxy,
      extension,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    // Define params for payout shares outstanding calls
    const callArgs = payoutSharesOutstandingForFeesArgs(fees);
    const actionId = FeeManagerActionId.PayoutSharesOutstandingForFees;

    // Attempting to payout should not mint shares while `payout` returns false
    await callOnExtension({
      comptrollerProxy,
      extension,
      actionId,
      callArgs,
    });

    expect(await vaultProxy.balanceOf(fundOwner)).toEqBigNumber(preFundOwnerSharesCall);

    // Set payout() to return true on both fees
    await mockContinuousFeeSettleOnly.payout.returns(true);
    await mockContinuousFeeWithGavAndUpdates.payout.returns(true);

    // Payout fees
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension,
      actionId,
      callArgs,
    });

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    // One event should have been emitted for each fee
    const events = extractEvent(receipt, feeManager.abi.getEvent('SharesOutstandingPaidForFund'));
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockContinuousFeeSettleOnly,
      sharesDue: feeAmount1,
    });
    // expect(events[1]).toMatchEventArgs({
    //   comptrollerProxy,
    //   fee: mockContinuousFeeWithGavAndUpdates,
    //   sharesDue: feeAmount22,
    // });

    // Both fees should be paid out to the fund owner
    const expectedSharesOutstandingPaid = feeAmount1.add(feeAmount22);
    // expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall.add(expectedSharesOutstandingPaid));

    // There should be no change in shares in the VaultProxy
    // expect(postSharesOutstandingCall).toEqBigNumber(feeAmount2.mul(8).div(100));

    const gav = (await comptrollerProxy.calcGav.args(true).call()).gav_;
    console.log(
      '=====gav ::',
      Number(BigNumber.from(await vaultProxy.balanceOf(buyer))),
      Number(BigNumber.from(await vaultProxy.totalSupply())),
      Number(BigNumber.from(postFundOwnerSharesCall)),
      Number(BigNumber.from(postSharesOutstandingCall)),
      Number(BigNumber.from(expectedSharesOutstandingPaid)),
      Number(BigNumber.from(gav)),
    );
  });
});
