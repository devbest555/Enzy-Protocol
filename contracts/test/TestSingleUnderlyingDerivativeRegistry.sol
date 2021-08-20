// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

import "../release/infrastructure/price-feeds/derivatives/feeds/utils/SingleUnderlyingDerivativeRegistryMixin.sol";

/// @title TestSingleUnderlyingDerivativeRegistry Contract
/// @notice A test implementation of SingleUnderlyingDerivativeRegistryMixin
contract TestSingleUnderlyingDerivativeRegistry is SingleUnderlyingDerivativeRegistryMixin {
    constructor(address _dispatcher) public SingleUnderlyingDerivativeRegistryMixin(_dispatcher) {}
}
