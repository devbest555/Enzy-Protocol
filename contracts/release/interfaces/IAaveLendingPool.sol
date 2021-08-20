// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title IAaveLendingPool interface
interface IAaveLendingPool {
    function deposit(
        address,
        uint256,
        address,
        uint16
    ) external;

    function withdraw(
        address,
        uint256,
        address
    ) external returns (uint256);
}
