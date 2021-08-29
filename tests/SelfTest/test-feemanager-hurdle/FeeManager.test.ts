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
  ProtocolFee,
  Dispatcher,
  WETH,
} from '@taodao/protocol';
import {
  assertEvent,
  buyShares,
  callOnExtension,
  createNewFund,
  generateRegisteredMockFees,
  // assertNoEvent,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
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
    await mockContinuousFeeSettleOnly.settle.returns(
      FeeSettlementType.TransferAsset,
      constants.AddressZero,
      utils.parseEther('0.5'),//500000000000000000
    );

    // Settling the fee
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,//0 = __invokeHook()
    });
    
    // _comptrollerProxy, _fee, settlementType, payer, payee, sharesDue
    // Check that the FeeSettledForFund event has been emitted
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    assertEvent(receipt, feeSettledForFundEvent, {
      settlementType: FeeSettlementType.TransferAsset,
      comptrollerProxy,
      fee: mockContinuousFeeSettleOnly,
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
      fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates, mockHurdleFeeSettle },
      fundOwner,
      deployer,
      denominationAsset,      
      createFund,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
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

    const preFundOwnerAssetCall = await denominationAsset.balanceOf(fundOwner);
    const preAssetOutstandingCall = await denominationAsset.balanceOf(vaultProxy);
    const investAssetAmount = await comptrollerProxy.getInvestAmount.args(denominationAsset).call();
    const gav_1 = (await comptrollerProxy.calcGav.args(true).call()).gav_;
    console.log("=====after buyShares ::", 
    Number(BigNumber.from(investmentAmount)),
    Number(BigNumber.from(await vaultProxy.balanceOf(buyer))),
    Number(BigNumber.from(await vaultProxy.totalSupply())),
    Number(BigNumber.from(preFundOwnerAssetCall)),//0
    Number(BigNumber.from(preAssetOutstandingCall)),
    Number(BigNumber.from(investAssetAmount)),
    Number(BigNumber.from(gav_1))); 


    // Define both fees the same way, but with different fee amounts    
    const unit = utils.parseEther('1');
    const divider = utils.parseEther('.08');
    
    const feeAmount1 = utils.parseEther('0.5');
    await mockContinuousFeeSettleOnly.settle.returns(FeeSettlementType.Mint, constants.AddressZero, feeAmount1);
    const feeAmount2 = utils.parseEther('0.2');
    await mockContinuousFeeWithGavAndUpdates.settle.returns(FeeSettlementType.Mint, constants.AddressZero, feeAmount2);
    const feeAmount3 = utils.parseEther('0.4');
    await mockHurdleFeeSettle.settle.returns(FeeSettlementType.TransferAsset, constants.AddressZero, feeAmount3);
    const feeAmount2_2 = feeAmount2.sub(feeAmount2.mul(divider).div(unit));

    // Define param for all calls on extension
    const extension = deployment.feeManager;
    const fees = [mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates, mockHurdleFeeSettle];

    // Settle once via callOnExtension to mint shares outstanding with no payout
    await callOnExtension({
      comptrollerProxy,
      extension,
      actionId: FeeManagerActionId.InvokeContinuousHook,//0 = __invokeHook()
    });    

    // Attempting to payout should not mint shares while `payout` returns false
    const actionId = FeeManagerActionId.PayoutSharesOutstandingForFees;//1 = __payoutSharesOutstandingForFees(),
    const callArgs = payoutSharesOutstandingForFeesArgs(fees);//
    await callOnExtension({
      comptrollerProxy,
      extension,
      actionId,
      callArgs,
    });  

    // Set payout() to return true on both fees
    await mockContinuousFeeSettleOnly.payout.returns(true);
    await mockContinuousFeeWithGavAndUpdates.payout.returns(true);
    await mockHurdleFeeSettle.payout.returns(true);

    const protocolFeeConfig= protocolFeesArgs({
      feeDeposit: utils.parseEther('0.2'),
      feeWithdraw: utils.parseEther('0.5'),
      feePerform: utils.parseEther('8'),
      feeStream: utils.parseEther('0.5'),
    });
    const mockDispatcher = await Dispatcher.mock(deployer);
    const protocolFeeInstance = await ProtocolFee.deploy(deployer, mockDispatcher);
    await protocolFeeInstance.connect(deployer).addFeeSettings(protocolFeeConfig)
    // await mockDispatcher.forward(protocolFeeInstance.addFeeSettings, protocolFeeConfig);
    console.log("===passed", mockDispatcher.address, deployer.address, protocolFeeInstance.address);
    // Payout fees
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension,
      actionId,
      callArgs
    });

    const postFundOwnerAssetCall = await denominationAsset.balanceOf(fundOwner);
    const postAssetOutstandingCall = await denominationAsset.balanceOf(vaultProxy);
    console.log("=====callOnExtension-3::", 
    Number(BigNumber.from(postFundOwnerAssetCall)),
    Number(BigNumber.from(postAssetOutstandingCall)));
    // One event should have been emitted for each fee
    const events = extractEvent(receipt, deployment.feeManager.abi.getEvent('SharesOutstandingPaidForFund'));
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockContinuousFeeSettleOnly,
      sharesDue: feeAmount1,
    });
    expect(events[1]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockContinuousFeeWithGavAndUpdates,
      sharesDue: feeAmount2,
    });

    // Both fees should be paid out to the fund owner
    const expectedAssetOutstandingPaid = feeAmount1.add(feeAmount2_2);
    expect(postFundOwnerAssetCall).toEqBigNumber(preFundOwnerAssetCall.add(expectedAssetOutstandingPaid));

    const gav = (await comptrollerProxy.calcGav.args(true).call()).gav_;    
    console.log("=====gav ::", 
    Number(BigNumber.from(await vaultProxy.balanceOf(buyer))),
    Number(BigNumber.from(await vaultProxy.totalSupply())),
    Number(BigNumber.from(postFundOwnerAssetCall)),
    Number(BigNumber.from(postAssetOutstandingCall)),
    Number(BigNumber.from(expectedAssetOutstandingPaid)),
    Number(BigNumber.from(gav))); 
  });
});
