// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "../release/infrastructure/price-feeds/derivatives/feeds/utils/SinglePeggedDerivativePriceFeedBase.sol";

/// @title TestSingleUnderlyingDerivativeRegistry Contract
/// @notice A test implementation of SinglePeggedDerivativePriceFeedBase
contract TestSinglePeggedDerivativePriceFeed is SinglePeggedDerivativePriceFeedBase {
    constructor(address _derivative, address _underlying)
        public
        SinglePeggedDerivativePriceFeedBase(_derivative, _underlying)
    {}
}
