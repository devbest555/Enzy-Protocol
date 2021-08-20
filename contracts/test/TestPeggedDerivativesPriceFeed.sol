// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

import "../release/infrastructure/price-feeds/derivatives/feeds/utils/PeggedDerivativesPriceFeedBase.sol";

/// @title TestSingleUnderlyingDerivativeRegistry Contract
/// @notice A test implementation of PeggedDerivativesPriceFeedBase
contract TestPeggedDerivativesPriceFeed is PeggedDerivativesPriceFeedBase {
    constructor(address _dispatcher) public PeggedDerivativesPriceFeedBase(_dispatcher) {}
}
