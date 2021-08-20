// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

import "./IDerivativePriceFeed.sol";

/// @title IDerivativePriceFeed Interface
interface IAggregatedDerivativePriceFeed is IDerivativePriceFeed {
    function getPriceFeedForDerivative(address) external view returns (address);
}
