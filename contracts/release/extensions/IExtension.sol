// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title IExtension Interface
/// @notice Interface for all extensions
interface IExtension {
    function activateForFund(bool _isMigration) external;

    function deactivateForFund() external;

    function receiveCallFromComptroller(
        address _comptrollerProxy,
        uint256 _actionId,
        bytes calldata _callArgs
    ) external;

    function setConfigForFund(bytes calldata _configData) external;

    function actionForZeroEX(
        address _redeemer,
        address _adapter,
        uint256[] memory _payoutAmounts, 
        address[] memory _payoutAssets,
        bytes calldata _signature
    ) external returns (uint256);
}
