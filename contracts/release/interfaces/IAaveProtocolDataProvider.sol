// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title IAaveProtocolDataProvider interface
interface IAaveProtocolDataProvider {
    function getReserveTokensAddresses(address)
        external
        view
        returns (
            address,
            address,
            address
        );
}
