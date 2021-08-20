// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title IAlphaHomoraV1Bank interface
interface IAlphaHomoraV1Bank {
    function deposit() external payable;

    function totalETH() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function withdraw(uint256) external;
}
