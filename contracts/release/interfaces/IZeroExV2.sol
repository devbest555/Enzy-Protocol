// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @dev Minimal interface for our interactions with the ZeroEx Exchange contract
interface IZeroExV2 {
    struct Order {
        address makerAddress; // Address that created the order.
        address takerAddress; // Address that is allowed to fill the order. If set to 0, any address is allowed to fill the order.
        address feeRecipientAddress; // Address that will recieve fees when order is filled.
        address senderAddress; // Address that is allowed to call Exchange contract methods that affect this order. If set to 0, any address is allowed to call these methods.
        uint256 makerAssetAmount; // Amount of makerAsset being offered by maker. Must be greater than 0.
        uint256 takerAssetAmount; // Amount of takerAsset being bid on by maker. Must be greater than 0.
        uint256 makerFee; // Amount of ZRX paid to feeRecipient by maker when order is filled. If set to 0, no transfer of ZRX from maker to feeRecipient will be attempted.
        uint256 takerFee; // Amount of ZRX paid to feeRecipient by taker when order is filled. If set to 0, no transfer of ZRX from taker to feeRecipient will be attempted.
        uint256 expirationTimeSeconds; // Timestamp in seconds at which order expires.
        uint256 salt; // Arbitrary number to facilitate uniqueness of the order's hash.
        bytes makerAssetData; // Encoded data that can be decoded by a specified proxy contract when transferring makerAsset. The last byte references the id of this proxy.
        bytes takerAssetData; // Encoded data that can be decoded by a specified proxy contract when transferring takerAsset. The last byte references the id of this proxy.
    }

    struct OrderInfo {
        uint8 orderStatus; // Status that describes order's validity and fillability.
        bytes32 orderHash; // EIP712 hash of the order (see LibOrder.getOrderHash).
        uint256 orderTakerAssetFilledAmount; // Amount of order that has already been filled.
    }

    struct FillResults {
        uint256 makerAssetFilledAmount; // Total amount of makerAsset(s) filled.
        uint256 takerAssetFilledAmount; // Total amount of takerAsset(s) filled.
        uint256 makerFeePaid; // Total amount of ZRX paid by maker(s) to feeRecipient(s).
        uint256 takerFeePaid; // Total amount of ZRX paid by taker to feeRecipients(s).
    }

    function ZRX_ASSET_DATA() external view returns (bytes memory);

    function filled(bytes32) external view returns (uint256);

    function cancelled(bytes32) external view returns (bool);

    function getOrderInfo(Order calldata) external view returns (OrderInfo memory);

    function getAssetProxy(bytes4) external view returns (address);

    function isValidSignature(
        bytes32,
        address,
        bytes calldata
    ) external view returns (bool);

    function preSign(
        bytes32,
        address,
        bytes calldata
    ) external;

    function cancelOrder(Order calldata) external;

    function fillOrder(
        Order calldata,
        uint256,
        bytes calldata
    ) external returns (FillResults memory);

    /// @dev Fills the input order. Reverts if exact takerAssetFillAmount not filled.
    /// @param order Order struct containing order specifications.
    /// @param takerAssetFillAmount Desired amount of takerAsset to sell.
    /// @param signature Proof that order has been created by maker.
    function fillOrKillOrder(
        Order memory order,
        uint256 takerAssetFillAmount,
        bytes memory signature
    ) external returns (FillResults memory fillResults);
}
