// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title IYearnVaultV2Registry Interface
/// @notice Minimal interface for our interactions with the Yearn Vault V2 registry
interface IYearnVaultV2Registry {
    function numVaults(address) external view returns (uint256);

    function vaults(address, uint256) external view returns (address);
}
