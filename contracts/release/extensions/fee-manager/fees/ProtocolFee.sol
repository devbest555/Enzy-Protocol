// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../persistent/dispatcher/IDispatcher.sol";

contract ProtocolFee {
    using SafeMath for uint256;

    event FeeSettingsAdded(
        address indexed daoAddress,
        uint256 feeDeposit,
        uint256 feeWithdraw,
        uint256 feePerform,
        uint256 feeStream
    );

    address internal daoAddress;
    uint256 internal feeDeposit;
    uint256 internal feeWithdraw;
    uint256 internal feePerform;
    uint256 internal feeStream;
    address private immutable DISPATCHER;

    modifier onlyDispatcherOwner() {
        address owner = IDispatcher(DISPATCHER).getOwner();
        address denomOwner = IDispatcher(DISPATCHER).getNominatedOwner();
        require(msg.sender == owner || msg.sender == denomOwner, "Only owner callable");
        _;
    }

    constructor(address _dispatcher) public {
        DISPATCHER = _dispatcher;
    }

    /// @notice Add the initial fee settings for Protocol
    /// @param _settingsData Encoded settings to apply to the policy for the fund
    /// @dev `feeDeposit`, `feeWithdraw`, `feeStream` and `feePerform` are set
    function addFeeSettings(bytes calldata _settingsData) external onlyDispatcherOwner {
        (
            uint256 feeDeposit_, //0.2%
            uint256 feeWithdraw_, //0.5%
            uint256 feePerform_, //8%
            uint256 feeStream_ //0.5%
        ) = abi.decode(_settingsData, (uint256, uint256, uint256, uint256));

        require(feeDeposit_ > 0, "addFeeSettings: feeDeposit must be greater than 0");
        require(feeWithdraw_ > 0, "addFeeSettings: feeWithdraw must be greater than 0");
        require(feePerform_ > 0, "addFeeSettings: feePerform must be greater than 0");
        require(feeStream_ > 0, "addFeeSettings: feeStream must be greater than 0");

        feeDeposit = feeDeposit_;
        feeWithdraw = feeWithdraw_;
        feePerform = feePerform_;
        feeStream = feeStream_;
        daoAddress = IDispatcher(DISPATCHER).getOwner();

        emit FeeSettingsAdded(daoAddress, feeDeposit_, feeWithdraw_, feePerform_, feeStream_);
    }

    /// @notice Sets the new daoAddress
    /// @param _daoAddress The address to set as the new owner
    function setDAOAddress(address _daoAddress) public onlyDispatcherOwner {
        require(_daoAddress != address(0), "setDAOAddress: daoAddress must not be empty");
        require(_daoAddress != daoAddress, "setDAOAddress: daoAddress must not be pre address");
        daoAddress = _daoAddress;
    }

    /// @notice Get Deposit fee for Protocol
    function getFeeDeposit() external view returns (uint256) {
        return feeDeposit;
    }

    /// @notice Get Withdraw fee for Protocol
    function getFeeWithdraw() external view returns (uint256) {
        return feeWithdraw;
    }

    /// @notice Get protocol fee of PerformanceFee
    function getFeePerform() public view returns (uint256 feePerform_) {
        return feePerform;
    }

    /// @notice Get Streaming fee for Protocol
    function getFeeStream() external view returns (uint256) {
        return feeStream;
    }

    /// @notice Get Owner for DAO Protocol
    function getDaoAddress() external view returns (address daoAddress_) {
        return daoAddress;
    }
}
