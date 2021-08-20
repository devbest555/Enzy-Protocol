// SPDX-License-Identifier: GPL-3.0



pragma solidity ^0.6.12;

/// @title ICEther Interface
/// @notice Minimal interface for interactions with Compound Ether
interface ICEther {
    function mint() external payable;
}
