// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../core/fund/comptroller/ComptrollerLib.sol";
import "../FeeManager.sol";
import "./utils/FeeBase.sol";
import "hardhat/console.sol";

/// @title PerformanceFeeHurdle Contract
/// @notice A performance-based fee with configurable rate and crystallization period, using hurdle rate
/// @dev This contract assumes that all shares in the VaultProxy are shares outstanding,
/// which is fine for this release. Even if they are not, they are still asset amount that
/// are only claimable by the fund owner.
contract PerformanceFeeHurdle is FeeBase {
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    event ActivatedForFund(address indexed comptrollerProxy, uint256 hurdleRate);

    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate, uint256 period, uint256 hurdleRate);

    event LastAssetAmountUpdated(
        address indexed comptrollerProxy,
        uint256 prevAssetAmount,
        uint256 nextAssetAmount
    );

    event PaidOut(
        address indexed comptrollerProxy,
        uint256 hurdleRate,
        uint256 currentAssetAmount
    );

    event PerformanceUpdated(
        address indexed comptrollerProxy,
        int256 assetAmountDue,
        uint256 currentAssetValue
    );

    struct FeeInfo {
        uint256 rate;
        uint256 period;
        uint256 activated;
        uint256 lastPaid;
        uint256 hurdleRate;
        uint256 lastAssetAmount;
    }

    uint256 private constant RATE_DIVISOR = 10**18;
    uint256 private constant SHARE_UNIT = 10**18;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    /// @notice Provides a constant string identifier for a fee
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "PERFORMANCE_HURDLE";
    }

    /// @notice Add the initial fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the policy for the fund
    /// @dev `hurdleRate`, `lastAssetAmount`, and `activated` are set during activation
    /// @dev feePeriod: Minimum crystallization period is 30 Days
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager 
    {
        (uint256 feeRate, uint256 feePeriod, uint256 hurdleRate) = abi.decode(_settingsData, (uint256, uint256, uint256));
        require(feeRate > 0, "addFundSettings: feeRate must be greater than 0");
        require(feePeriod > 30 days, "addFundSettings: feePeriod must be greater than 30 days");  
        require(hurdleRate > 0, "addFundSettings: hurdleRate must be greater than 0");

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({
            rate: feeRate,
            period: feePeriod,
            activated: 0,
            lastPaid: 0,
            hurdleRate: hurdleRate,
            lastAssetAmount: 0
        });

        emit FundSettingsAdded(_comptrollerProxy, feeRate, feePeriod, hurdleRate);
    }

    
    /// @notice Activates the fee for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    function activateForFund(address _comptrollerProxy, address) external override onlyFeeManager {
        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];

        address denominationAsset = ComptrollerLib(_comptrollerProxy).getDenominationAsset();
        uint256 assetAmount = ComptrollerLib(_comptrollerProxy).calcEachBalance(denominationAsset);

        feeInfo.lastAssetAmount = assetAmount;
        feeInfo.activated = block.timestamp;

        emit ActivatedForFund(_comptrollerProxy, assetAmount);
    }
    
    /// @notice Gets the hooks that are implemented by the fee
    /// @return implementedHooksForSettle_ The hooks during which settle() is implemented
    /// @return implementedHooksForUpdate_ The hooks during which update() is implemented
    /// @return usesGavOnSettle_ True if GAV is used during the settle() implementation
    /// @return usesGavOnUpdate_ True if GAV is used during the update() implementation
    /// @dev Used only during fee registration
    function implementedHooks()
        external
        view
        override
        returns (
            IFeeManager.FeeHook[] memory implementedHooksForSettle_,
            IFeeManager.FeeHook[] memory implementedHooksForUpdate_,
            bool usesGavOnSettle_,
            bool usesGavOnUpdate_
        )
    {
        implementedHooksForSettle_ = new IFeeManager.FeeHook[](3);
        implementedHooksForSettle_[0] = IFeeManager.FeeHook.Continuous;
        implementedHooksForSettle_[1] = IFeeManager.FeeHook.BuySharesSetup;
        implementedHooksForSettle_[2] = IFeeManager.FeeHook.PreRedeemShares;

        implementedHooksForUpdate_ = new IFeeManager.FeeHook[](3);
        implementedHooksForUpdate_[0] = IFeeManager.FeeHook.Continuous;
        implementedHooksForUpdate_[1] = IFeeManager.FeeHook.BuySharesCompleted;
        implementedHooksForUpdate_[2] = IFeeManager.FeeHook.PreRedeemShares;

        return (implementedHooksForSettle_, implementedHooksForUpdate_, true, true);
    }

    /// @notice Checks whether the shares outstanding for the fee can be paid out, and updates the info for the fee's last payout
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return isPayable_ True if shares outstanding can be paid out
    function payout(address _comptrollerProxy, address)
        external
        override
        onlyFeeManager
        returns (bool isPayable_)
    {
        if (!payoutAllowed(_comptrollerProxy)) {
            return false;
        }

        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
         
        uint256 prevAssetAmount = feeInfo.lastAssetAmount;               
        address denominationAsset = ComptrollerLib(_comptrollerProxy).getDenominationAsset();   
        uint256 currentAssetAmount = ComptrollerLib(_comptrollerProxy).calcEachBalance(denominationAsset);      
        if (prevAssetAmount == 0) 
            return false;
            
        if (prevAssetAmount.add(prevAssetAmount.mul(feeInfo.hurdleRate).div(RATE_DIVISOR)) >= currentAssetAmount) 
            return false;
        console.log("=====sol-payout-prevAssetAmount::", prevAssetAmount);
        console.log("=====sol-payout-currentAssetAmount::", currentAssetAmount);
        feeInfo.lastPaid = block.timestamp;      
        feeInfo.lastAssetAmount = currentAssetAmount;
        console.log("=====sol-payout-lastAssetAmount::", feeInfo.lastAssetAmount);

        emit PaidOut(_comptrollerProxy, feeInfo.hurdleRate, currentAssetAmount);

        return true;
    }

    /// @notice Settles the fee and calculates asset due
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _gav The GAV of the fund
    /// @return settlementType_ The type of settlement
    /// @return (unused) The payer of asset amount due
    /// @return assetAmountDue_ The amount of asset due
    function settle(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook,
        bytes calldata,
        uint256 _gav
    )
        external
        override
        onlyFeeManager
        returns (
            IFeeManager.SettlementType settlementType_,
            address,
            uint256 assetAmountDue_
        )
    {
        if (_gav == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }
        
        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        uint256 prevAssetAmount = feeInfo.lastAssetAmount;
        address denominationAsset = ComptrollerLib(_comptrollerProxy).getDenominationAsset(); 
        uint256 currentAssetAmount = ComptrollerLib(_comptrollerProxy).calcEachBalance(denominationAsset);
        
        int256 settlementAssetAmountDue = __settleAndUpdatePerformance(
            _comptrollerProxy,
            _vaultProxy,
            currentAssetAmount,
            prevAssetAmount
        );

        if (settlementAssetAmountDue > 0) {
            return (
                IFeeManager.SettlementType.TransferAsset,
                address(0),
                uint256(settlementAssetAmountDue)
            );
        } else {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }
    }

    /// @notice Updates the fee state after all fees have finished settle()
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    function update(
        address _comptrollerProxy,
        address,
        IFeeManager.FeeHook,
        bytes calldata,
        uint256
    ) external override onlyFeeManager {
        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        uint256 prevAssetAmount = feeInfo.lastAssetAmount;
        address denominationAsset = ComptrollerLib(_comptrollerProxy).getDenominationAsset();            
        uint256 nextAssetAmount = ComptrollerLib(_comptrollerProxy).calcEachBalance(denominationAsset);
        
        console.log("====sol-update-nextAssetAmount::", nextAssetAmount);
        console.log("====sol-update-prevAssetAmount::", prevAssetAmount);
        if (nextAssetAmount == prevAssetAmount) {
            return;
        }

        feeInfo.lastAssetAmount = nextAssetAmount;        
        console.log("====sol-update-lastAssetAmount::", comptrollerProxyToFeeInfo[_comptrollerProxy].lastAssetAmount);
        emit LastAssetAmountUpdated(_comptrollerProxy, prevAssetAmount, nextAssetAmount);
    }

    /// @notice Checks whether the Asset Amount can be paid out
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return payoutAllowed_ True if the fee payment is due
    function payoutAllowed(address _comptrollerProxy) public view returns (bool payoutAllowed_) {
        FeeInfo memory feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        uint256 period = feeInfo.period;

        uint256 timeSinceActivated = block.timestamp.sub(feeInfo.activated);

        // Check if at least 1 crystallization period has passed since activation
        if (timeSinceActivated < period) {
            return false;
        }

        // Check that a full crystallization period has passed since the last payout
        uint256 timeSincePeriodStart = timeSinceActivated % period;
        uint256 periodStart = block.timestamp.sub(timeSincePeriodStart);
        return feeInfo.lastPaid < periodStart;
    }

    ///////////////////////
    // PRIVATE FUNCTIONS //
    ///////////////////////

    /// @dev Helper to settle the fee and update performance state.
    function __settleAndUpdatePerformance(
        address _comptrollerProxy,
        address,
        uint256 _currentAssetAmount,
        uint256 _pervAssetAmount
    ) private returns (int256 assetAmountDue_) {

        FeeInfo storage feeInfo = comptrollerProxyToFeeInfo[_comptrollerProxy];
        assetAmountDue_ = __calcPerformanceByHurdle(
            feeInfo,
            _currentAssetAmount,
            _pervAssetAmount
        );

        emit PerformanceUpdated(_comptrollerProxy, assetAmountDue_, _currentAssetAmount);

        return assetAmountDue_;
    }

    /// @dev Helper to calculate the next `lastSharePrice` value
    function __calcNextSharePrice(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook _hook,
        bytes memory _settlementData,
        uint256 _gav
    ) private view returns (uint256 nextSharePrice_) {
        uint256 denominationAssetUnit = 10 **uint256(ERC20(ComptrollerLib(_comptrollerProxy).getDenominationAsset()).decimals());
        if (_gav == 0) {
            return denominationAssetUnit;
        }

        // Get shares outstanding via VaultProxy balance and calc shares supply to get net shares supply
        ERC20 vaultProxyContract = ERC20(_vaultProxy);
        uint256 totalSharesSupply = vaultProxyContract.totalSupply();
        uint256 nextNetSharesSupply = totalSharesSupply.sub(
            vaultProxyContract.balanceOf(_vaultProxy)
        );
        if (nextNetSharesSupply == 0) {
            return denominationAssetUnit;
        }

        uint256 nextGav = _gav;

        // For both Continuous and BuySharesCompleted hooks, _gav and shares supply will not change,
        // we only need additional calculations for PreRedeemShares
        if (_hook == IFeeManager.FeeHook.PreRedeemShares) {
            (, uint256 sharesDecrease) = __decodePreRedeemSharesSettlementData(_settlementData);

            // Shares have not yet been burned
            nextNetSharesSupply = nextNetSharesSupply.sub(sharesDecrease);
            if (nextNetSharesSupply == 0) {
                return denominationAssetUnit;
            }

            // Assets have not yet been withdrawn
            uint256 gavDecrease = _gav.mul(sharesDecrease).div(totalSharesSupply);

            nextGav = nextGav.sub(gavDecrease);
            if (nextGav == 0) {
                return denominationAssetUnit;
            }
        }

        return nextGav.mul(SHARE_UNIT).div(nextNetSharesSupply);
    }
    
    /// @dev Helper to calculate the performance metrics for a fund.
    function __calcPerformanceByHurdle(
        FeeInfo memory feeInfo,
        uint256 _currentAssetAmount,
        uint256 _prevlAssetAmount
    ) private pure returns (int256 assetAmountDue_) {
        uint256 performanceAssetAmount = _currentAssetAmount.sub(
            _prevlAssetAmount.add(
                _prevlAssetAmount.mul(feeInfo.hurdleRate).div(RATE_DIVISOR)
            )
        );
        assetAmountDue_ = int256(performanceAssetAmount.mul(feeInfo.rate).div(RATE_DIVISOR));

        return assetAmountDue_;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the feeInfo for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract of the fund
    /// @return feeInfo_ The feeInfo
    function getFeeInfoForFund(address _comptrollerProxy)
        external
        view
        returns (FeeInfo memory feeInfo_)
    {
        return comptrollerProxyToFeeInfo[_comptrollerProxy];
    }
}