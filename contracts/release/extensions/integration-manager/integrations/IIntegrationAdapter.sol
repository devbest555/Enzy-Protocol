// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../IIntegrationManager.sol";
import "../../../interfaces/IZeroExV2.sol";

/// @title Integration Adapter interface
/// @notice Interface for all integration adapters
interface IIntegrationAdapter {
    function identifier() external pure returns (string memory identifier_);

    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
        external
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        );

    function fillOrderZeroEX(
        IZeroExV2.Order memory _order,
        bytes calldata _signature,
        uint256 _takerAssetFillAmount
    )
        external
        returns (uint256 amount_);
}
