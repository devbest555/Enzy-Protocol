// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

import "./utils/SinglePeggedDerivativePriceFeedBase.sol";

/// @title StakehoundEthPriceFeed Contract
/// @notice Price source oracle for Stakehound stETH, which maps 1:1 with ETH
contract StakehoundEthPriceFeed is SinglePeggedDerivativePriceFeedBase {
    constructor(address _steth, address _weth)
        public
        SinglePeggedDerivativePriceFeedBase(_steth, _weth)
    {}
}
