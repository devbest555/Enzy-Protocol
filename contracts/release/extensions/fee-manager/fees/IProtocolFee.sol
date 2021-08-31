// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title Fee Interface
interface IProtocolFee {

    function addFeeSettings(bytes calldata _settingsData) external;

    function getFeeDeposit() external view returns(uint256);

    /// @notice Get Withdraw fee for Protocol
    function getFeeWithdraw() external view returns(uint256);

    /// @notice Get protocol fee of PerformanceFee
    function getFeePerform() external view returns(uint256);

    /// @notice Get Streaming fee for Protocol
    function getFeeStream() external view returns(uint256);

    /// @notice Set DaoAddress for DAO Protocol
    function setDAOAddress(address _daoAddress) external;

    /// @notice Get DaoAddress for DAO Protocol
    function getDaoAddress() external view returns(address);
}
