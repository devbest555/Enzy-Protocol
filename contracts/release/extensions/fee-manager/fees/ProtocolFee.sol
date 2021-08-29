// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../persistent/dispatcher/IDispatcher.sol";
import "hardhat/console.sol";

contract ProtocolFee {    
    using SafeMath for uint256;

    event FeeSettingsAdded(address indexed owner, uint256 feeDeposit, uint256 feeWithdraw, uint256 feePerform, uint256 feeStream);

    address private owner;
    uint256 private feeDeposit; 
    uint256 private feeWithdraw; 
    uint256 private feePerform; 
    uint256 private feeStream;    
    address private immutable DISPATCHER;    

    modifier onlyDispatcherOwner() {
        owner = IDispatcher(DISPATCHER).getOwner();
        require(msg.sender == owner, "Only owner callable");
        _;
    }

    constructor(address _dispatcher) public {        
        DISPATCHER = _dispatcher;
    }

    /// @notice Add the initial fee settings for Protocol
    /// @param _settingsData Encoded settings to apply to the policy for the fund
    /// @dev `feeDeposit`, `feeWithdraw`, `feeStream` and `feePerform` are set
    function addFeeSettings(bytes calldata _settingsData)
        external
        onlyDispatcherOwner
    {
        (
            uint256 feeDeposit_, //0.2%
            uint256 feeWithdraw_,//0.5% 
            uint256 feePerform_, //8%
            uint256 feeStream_   //0.5%
        ) = abi.decode(_settingsData, (uint256, uint256, uint256, uint256));

        require(feeDeposit_ > 0, "addFeeSettings: feeDeposit must be greater than 0");
        require(feeWithdraw_ > 0, "addFeeSettings: feeWithdraw must be greater than 0");
        require(feePerform_ > 0, "addFeeSettings: feePerform must be greater than 0");
        require(feeStream_ > 0, "addFeeSettings: feeStream must be greater than 0");
        
        feeDeposit = feeDeposit_;
        feeWithdraw = feeWithdraw_;
        feePerform = feePerform_;
        feeStream = feeStream_;
        owner = IDispatcher(DISPATCHER).getOwner();
        console.log("=====protocol-owner::", owner);
        console.log("=====protocol-feePerform::", feePerform);
        emit FeeSettingsAdded(owner, feeDeposit_, feeWithdraw_, feePerform_, feeStream_);
    }

    /// @notice Get Deposit fee for Protocol
    function getFeeDeposit() external view returns(uint256) {
        return feeDeposit;
    }

    /// @notice Get Withdraw fee for Protocol
    function getFeeWithdraw() external view returns(uint256) {
        return feeWithdraw;
    }

    /// @notice Get protocol fee of PerformanceFee
    function getFeePerform() external view returns(uint256) {
        return feePerform;
    }

    /// @notice Get Streaming fee for Protocol
    function getFeeStream() external view returns(uint256) {
        return feeStream;
    }

    /// @notice Get Owner for DAO Protocol
    function getOwner() external view returns(address) {
        return owner;
    }

}