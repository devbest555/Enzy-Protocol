// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title ISynthetixProxyERC20 Interface
interface ISynthetixProxyERC20 {
    function target() external view returns (address);
}
