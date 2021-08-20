// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title IAaveLendingPoolAddressProvider interface
interface IAaveLendingPoolAddressProvider {
    function getLendingPool() external view returns (address);
}
