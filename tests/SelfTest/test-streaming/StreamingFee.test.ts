import {
  ComptrollerLib,
  convertRateToScaledPerSecondRate,
  convertScaledPerSecondRateToRate,
  FeeHook,
  FeeManagerActionId,
  feeManagerConfigArgs,
  FeeSettlementType,
  StreamingFee,
  protocolFeesArgs,
  managementFeeConfigArgs,
  managementFeeSharesDue,
  VaultLib,
  WETH,
} from '@taodao/protocol';
import {
  assertEvent,
  buyShares,
  callOnExtension,
  createFundDeployer,
  createMigratedFundConfig,
  createNewFund,
  deployProtocolFixture,
  redeemShares,
  transactionTimestamp,
} from '@taodao/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [EOAFeeManager, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const denominationAsset = new WETH(config.weth, deployer);

  // get fees from ProtocolFee
  const feeDeposit = utils.parseEther('0.002'); //0.2%
  const feeWithdraw = utils.parseEther('0.005'); //0.5%
  const feePerform = utils.parseEther('0.08'); //8%
  const feeStreaming = utils.parseEther('0.005'); //0.5%
  const feeRate = convertRateToScaledPerSecondRate(feeStreaming);
  const protocolFeeConfig = protocolFeesArgs({
    feeDeposit: feeDeposit,
    feeWithdraw: feeWithdraw,
    feePerform: feePerform,
    feeStream: feeRate,
  });
  await deployment.protocolFee.connect(deployer).addFeeSettings(protocolFeeConfig);

  // Create standalone StreamingFee
  const protocolAddr = await deployment.protocolFee.address;
  const standaloneManagementFee = await StreamingFee.deploy(deployer, EOAFeeManager, protocolAddr);

  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.totalSupply.returns(0);
  await mockVaultProxy.balanceOf.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  // Add fee settings for ComptrollerProxy
  await standaloneManagementFee.connect(EOAFeeManager).addFundSettings(mockComptrollerProxy, utils.randomBytes(2));

  return {
    deployer,
    accounts: remainingAccounts,
    config,
    deployment,
    EOAFeeManager,
    feeStreaming,
    feeRate,
    mockComptrollerProxy,
    mockVaultProxy,
    standaloneManagementFee,
    denominationAsset,
    feeDeposit,
  };
}

describe('activateForFund', () => {
  it('can only be called by the FeeManager', async () => {
    const { mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } = await provider.snapshot(snapshot);

    await expect(
      standaloneManagementFee.activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  // i.e., a new fund
  it('correctly handles valid call for a fund with no shares (does nothing)', async () => {
    const { EOAFeeManager, mockComptrollerProxy, mockVaultProxy, feeRate, standaloneManagementFee } =
      await provider.snapshot(snapshot);

    // Activate fund
    await standaloneManagementFee.connect(EOAFeeManager).activateForFund(mockComptrollerProxy, mockVaultProxy);

    // Assert lastSettled has not been set
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      lastSettled: 0,
      feeRate,
    });
  });

  // i.e., a migrated fund
  it('correctly handles valid call for a fund with no shares (sets lastSettled)', async () => {
    const { EOAFeeManager, mockComptrollerProxy, mockVaultProxy, feeRate, standaloneManagementFee } =
      await provider.snapshot(snapshot);

    // Set the shares supply to be > 0
    await mockVaultProxy.totalSupply.returns(1);

    // Activate fund
    const receipt = await standaloneManagementFee
      .connect(EOAFeeManager)
      .activateForFund(mockComptrollerProxy, mockVaultProxy);

    // Assert lastSettled has been set to the tx timestamp
    const activationTimestamp = await transactionTimestamp(receipt);
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      lastSettled: activationTimestamp,
      feeRate,
    });
  });
});

describe('addFundSettings', () => {
  it('can only be called by the FeeManager', async () => {
    const { mockComptrollerProxy, standaloneManagementFee } = await provider.snapshot(snapshot);

    //   const managementFeeConfig = managementFeeConfigArgs(feeRate);
    await expect(
      standaloneManagementFee.addFundSettings(mockComptrollerProxy, utils.randomBytes(2)),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const { EOAFeeManager, feeRate, mockComptrollerProxy, standaloneManagementFee } = await provider.snapshot(snapshot);

    //   const managementFeeConfig = managementFeeConfigArgs(feeRate);
    const receipt = await standaloneManagementFee
      .connect(EOAFeeManager)
      .addFundSettings(mockComptrollerProxy, utils.randomBytes(2));

    // Assert the FundSettingsAdded event was emitted
    assertEvent(receipt, 'FundSettingsAdded', {
      comptrollerProxy: mockComptrollerProxy,
      feeRate,
    });

    // managementFeeRate should be set for comptrollerProxy
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      feeRate,
      lastSettled: BigNumber.from(0),
    });
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const { mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } = await provider.snapshot(snapshot);

    await expect(
      standaloneManagementFee.settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles shares supply of 0', async () => {
    const { EOAFeeManager, feeRate, mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } =
      await provider.snapshot(snapshot);

    // Check the return value via a call
    const settleCall = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0)
      .call();

    expect(settleCall).toMatchFunctionOutput(standaloneManagementFee.settle, {
      settlementType_: FeeSettlementType.None,
      sharesDue_: BigNumber.from(0),
    });

    // Send the tx to actually settle
    const receipt = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestamp = await transactionTimestamp(receipt);

    // Settled event emitted
    assertEvent(receipt, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: BigNumber.from(0),
      secondsSinceSettlement: BigNumber.from(settlementTimestamp),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      feeRate,
      lastSettled: BigNumber.from(settlementTimestamp),
    });
  });

  it('correctly handles shares supply > 0', async () => {
    const { EOAFeeManager, feeRate, mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } =
      await provider.snapshot(snapshot);

    // Settle while shares supply is 0 to set lastSettled
    const receiptOne = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestampOne = await transactionTimestamp(receiptOne);

    // Update shares supply on mock
    const sharesSupply = utils.parseEther('1');
    await mockVaultProxy.totalSupply.returns(sharesSupply);

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    // // Get the expected shares due for a call() to settle()
    // // The call() adds 1 second to the last block timestamp
    // const expectedFeeShares = managementFeeSharesDue({
    //   feeRate,
    //   sharesSupply,
    //   secondsSinceLastSettled: BigNumber.from(secondsToWarp).add(1),
    // });

    // Check the return values via a call() to settle()
    await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0)
      .call();

    // TODO: debug why this call often fails (has to do with the secondsSinceLastSettled calc
    // commented out above)
    // expect(settleCall).toMatchFunctionOutput(standaloneManagementFee.settle, {
    //   settlementType_: FeeSettlementType.Mint,
    //   sharesDue_: expectedFeeShares,
    // });

    // Send the tx to actually settle()
    const receiptTwo = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestampTwo = await transactionTimestamp(receiptTwo);

    const scaledPerSecondRate = feeRate;
    // Get the expected shares due for the actual settlement
    const expectedSharesDueForTx = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply,
      secondsSinceLastSettled: BigNumber.from(settlementTimestampTwo).sub(settlementTimestampOne),
    });

    // Settled event emitted with correct settlement values
    assertEvent(receiptTwo, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: expectedSharesDueForTx,
      secondsSinceSettlement: BigNumber.from(settlementTimestampTwo).sub(settlementTimestampOne),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      feeRate,
      lastSettled: BigNumber.from(settlementTimestampTwo),
    });
  });

  it('correctly handles shares outstanding > 0', async () => {
    const { EOAFeeManager, feeRate, mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } =
      await provider.snapshot(snapshot);

    // Settle while shares supply is 0 to set lastSettled
    const receiptOne = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestampOne = await transactionTimestamp(receiptOne);

    // Update shares supply and add sharesOutstanding to mock vault
    const sharesSupply = utils.parseEther('1');
    await mockVaultProxy.totalSupply.returns(sharesSupply);
    const sharesOutstanding = utils.parseEther('0.1');
    await mockVaultProxy.balanceOf.given(mockVaultProxy).returns(sharesOutstanding);
    const netSharesSupply = sharesSupply.sub(sharesOutstanding);

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);
    const timestampPostWarp = (await provider.getBlock('latest')).timestamp;

    // Get the expected shares due for a call() to settle()
    // The call() adds 1 second to the last block timestamp
    const scaledPerSecondRate = feeRate;
    const expectedFeeShares = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: netSharesSupply,
      secondsSinceLastSettled: BigNumber.from(timestampPostWarp).sub(settlementTimestampOne),
    });

    // Check the return values via a call() to settle()
    const settleCall = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0)
      .call();

    expect(settleCall).toMatchFunctionOutput(standaloneManagementFee.settle, {
      settlementType_: FeeSettlementType.Mint,
      sharesDue_: expectedFeeShares,
    });

    // Send the tx to actually settle()
    const receiptTwo = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestampTwo = await transactionTimestamp(receiptTwo);

    // Get the expected shares due for the actual settlement
    const expectedSharesDueForTx = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: netSharesSupply,
      secondsSinceLastSettled: BigNumber.from(settlementTimestampTwo).sub(settlementTimestampOne),
    });

    // Settled event emitted with correct settlement values
    assertEvent(receiptTwo, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: expectedSharesDueForTx,
      secondsSinceSettlement: BigNumber.from(settlementTimestampTwo).sub(settlementTimestampOne),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      feeRate,
      lastSettled: BigNumber.from(settlementTimestampTwo),
    });
  });
});

describe('integration', () => {
  it('can create a new fund with this fee, works correctly while buying shares', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner, fundInvestor],
      deployment: { feeManager, fundDeployer, streamingFee },
      feeDeposit,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    console.log(
      '=====fundInvestor::',
      fundInvestor.address,
      fundOwner.address,
      feeManager.address,
      fundDeployer.address,
    );
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const rate = utils.parseEther('0.005'); // 0.5%
    const feeRate = convertRateToScaledPerSecondRate(rate);

    const managementFeeSettings = managementFeeConfigArgs(feeRate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [streamingFee],
      settings: [managementFeeSettings],
    });

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    const feeInfo = await streamingFee.getFeeInfoForFund(comptrollerProxy.address);
    expect(feeInfo.feeRate).toEqBigNumber(feeRate);

    // Buying shares of the fund
    const buySharesReceipt = await buyShares({
      comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('1').div(2)],
    });

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    const sharesBeforePayout = await vaultProxy.totalSupply();

    const settleFeesReceipt = await callOnExtension({
      signer: fundOwner,
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    const buySharesTimestamp = await transactionTimestamp(buySharesReceipt);
    const settleFeesTimestamp = await transactionTimestamp(settleFeesReceipt);
    const elapsedSecondsBetweenBuyAndSettle = BigNumber.from(settleFeesTimestamp - buySharesTimestamp);

    // Get the expected fee shares for the elapsed time
    const scaledPerSecondRate = feeRate;
    const v = investmentAmount.sub(feeDeposit);
    const expectedFeeShares = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: v,
      secondsSinceLastSettled: elapsedSecondsBetweenBuyAndSettle,
    });

    const sharesAfterPayout = await vaultProxy.totalSupply();
    const sharesMinted = sharesAfterPayout.sub(sharesBeforePayout);
    console.log(
      '=====sharesAfterPayout::',
      Number(BigNumber.from(sharesBeforePayout)), //998000000000000000
      Number(BigNumber.from(sharesAfterPayout)), // 998000002062174000
      Number(BigNumber.from(sharesMinted)), //       2062173949
      Number(BigNumber.from(expectedFeeShares)),
    ); //    4124347
    // Check that the expected shares due have been minted
    expect(sharesMinted).toEqBigNumber(expectedFeeShares);

    // Check that the fundOwner has received these minted shares
    const fundOwnerBalance = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerBalance).toEqBigNumber(expectedFeeShares);
  });

  it('can create a new fund with this fee, works correctly while buying and then redeeming shares', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner, fundInvestor],
      deployment: { fundDeployer, streamingFee },
      feeDeposit,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const rate = utils.parseEther('0.005'); // 0.5%
    const feeRate = convertRateToScaledPerSecondRate(rate);

    const managementFeeSettings = managementFeeConfigArgs(feeRate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [streamingFee],
      settings: [managementFeeSettings],
    });

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    const feeInfo = await streamingFee.getFeeInfoForFund(comptrollerProxy.address);
    expect(feeInfo.feeRate).toEqBigNumber(feeRate);

    // Buying shares of the fund
    const buySharesReceipt = await buyShares({
      comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('1').div(2)],
    });

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    // Redeem all fundInvestor shares
    const redeemSharesReceipt = await redeemShares({
      comptrollerProxy,
      signer: fundInvestor,
    });

    const buySharesTimestamp = await transactionTimestamp(buySharesReceipt);
    const redeemSharesTimestamp = await transactionTimestamp(redeemSharesReceipt);
    const secondsElapsedBetweenBuyAndRedeem = BigNumber.from(redeemSharesTimestamp - buySharesTimestamp);

    // Get the expected shares fee shares
    const scaledPerSecondRate = feeRate;
    const v = investmentAmount.sub(feeDeposit);
    const expectedFeeShares = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: v,
      secondsSinceLastSettled: BigNumber.from(secondsElapsedBetweenBuyAndRedeem),
    });

    // Shares minted are what's left when we subtract the only investor has redeemed all shares
    const sharesMinted = await vaultProxy.totalSupply();
    console.log(
      '=====expectedFeeShares::',
      Number(BigNumber.from(sharesMinted)), //
      Number(BigNumber.from(expectedFeeShares)),
    ); //
    // Check that the expected shares due  have been minted
    expect(sharesMinted).toEqBigNumber(expectedFeeShares);

    // Check that the fundOwner has received these shares
    const fundOwnerBalance = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerBalance).toEqBigNumber(expectedFeeShares);
  });

  it('can migrate a fund with this fee, buying shares after migration', async () => {
    const {
      deployer,
      accounts: [fundOwner, fundInvestor],
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      denominationAsset,
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        fundDeployer,
        integrationManager,
        streamingFee,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      feeRate,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const managementFeeSettings = managementFeeConfigArgs(feeRate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [streamingFee],
      settings: [managementFeeSettings],
    });

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
      feeManagerConfigData,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    await signedNextFundDeployer.executeMigration(vaultProxy);

    const feeInfo = await streamingFee.getFeeInfoForFund(nextComptrollerProxy.address);
    expect(feeInfo.feeRate).toEqBigNumber(feeRate);

    // Buying shares of the fund
    const buySharesReceipt = await buyShares({
      comptrollerProxy: nextComptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('1').div(2)],
    });

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    const sharesBeforePayout = await vaultProxy.totalSupply();

    const settleFeesReceipt = await callOnExtension({
      signer: fundOwner,
      comptrollerProxy: nextComptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    const buySharesTimestamp = await transactionTimestamp(buySharesReceipt);
    const settleFeesTimestamp = await transactionTimestamp(settleFeesReceipt);
    const elapsedSecondsBetweenBuyAndSettle = BigNumber.from(settleFeesTimestamp - buySharesTimestamp);

    // Get the expected fee shares for the elapsed time
    const scaledPerSecondRate = feeRate;
    const expectedFeeShares = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: utils.parseEther('1'),
      secondsSinceLastSettled: elapsedSecondsBetweenBuyAndSettle,
    });

    const sharesAfterPayout = await vaultProxy.totalSupply();
    const sharesMinted = sharesAfterPayout.sub(sharesBeforePayout);

    // Check that the expected shares due  have been minted
    expect(sharesMinted).toEqBigNumber(expectedFeeShares);

    // Check that the fundOwner has received these shares
    const fundOwnerBalance = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerBalance).toEqBigNumber(expectedFeeShares);
  });

  it('can migrate a fund with this fee, buying shares before migration', async () => {
    const {
      deployer,
      accounts: [fundOwner, fundInvestor],
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      denominationAsset,
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        fundDeployer,
        integrationManager,
        streamingFee,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      feeRate,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const managementFeeSettings = managementFeeConfigArgs(feeRate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [streamingFee],
      settings: [managementFeeSettings],
    });

    const { vaultProxy, comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    // Buying shares of the fund
    const buySharesReceipt = await buyShares({
      comptrollerProxy: comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('1').div(2)],
    });

    const sharesBeforePayout = await vaultProxy.totalSupply(); // 1.0

    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
      feeManagerConfigData,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Migration execution settles the accrued fee
    const executeMigrationReceipt = await signedNextFundDeployer.executeMigration(vaultProxy);

    const feeInfo = await streamingFee.getFeeInfoForFund(comptrollerProxy.address);
    expect(feeInfo.feeRate).toEqBigNumber(feeRate);

    const sharesAfterPayout = await vaultProxy.totalSupply();
    const sharesMinted = sharesAfterPayout.sub(sharesBeforePayout);

    const buySharesTimestamp = await transactionTimestamp(buySharesReceipt);
    const migrationTimestamp = await transactionTimestamp(executeMigrationReceipt);
    const secondsElapsedBetweenBuyAndMigrate = BigNumber.from(migrationTimestamp - buySharesTimestamp);

    // Get the expected shares due
    const scaledPerSecondRate = feeRate;
    const expectedSharesDue = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: utils.parseEther('1'), // 1.0
      secondsSinceLastSettled: secondsElapsedBetweenBuyAndMigrate,
    });

    // Check that the expected shares due have been minted
    expect(sharesMinted).toEqBigNumber(expectedSharesDue);

    // Check that the fundOwner has received these shares
    const fundOwnerBalance = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerBalance).toEqBigNumber(expectedSharesDue);
  });
});

describe('utils', () => {
  it('correctly converts a rate to feeRate and back', async () => {
    const initialRate = utils.parseEther(`0.01`);
    const feeRate = convertRateToScaledPerSecondRate(initialRate);
    const finalRate = convertScaledPerSecondRateToRate(feeRate);

    expect(initialRate).toEqBigNumber(finalRate);
  });
});
