// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;

/// @title IIntegrationManager interface
/// @notice Interface for the IntegrationManager
interface IIntegrationManager {
    enum SpendAssetsHandleType {
        None,
        Approve,
        Transfer,
        Remove
    }
}
