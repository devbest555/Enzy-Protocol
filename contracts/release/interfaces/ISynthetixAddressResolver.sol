// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title ISynthetixAddressResolver Interface
interface ISynthetixAddressResolver {
    function requireAndGetAddress(bytes32, string calldata) external view returns (address);
}
