// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @dev Minimal interface for our interactions with the ZeroEx Exchange contract
interface IZeroExV4 {
    struct RfqOrder {
        address makerToken;  // The ERC20 token the maker is selling and the maker is selling to the taker. [required]
        address takerToken;  // The ERC20 token the taker is selling and the taker is selling to the maker. [required]
        uint128 makerAmount; // The amount of makerToken being sold by the maker. [required]
        uint128 takerAmount; // The amount of takerToken being sold by the taker. [required]
        address maker;       // The address of the maker, and signer, of this order. [required]
        address taker;       // Allowed taker address. Set to zero to allow any taker. [optional; default 0]
        address txOrigin;    // The allowed address of the EOA that submitted the Ethereum transaction. This must be set. Multiple  
                             //   addresses are supported via registerAllowedRfqOrigins. [required]
        bytes32 pool;        // The staking pool to attribute the 0x protocol fee from this order. Set to zero to attribute to the 
                             //   default pool, not owned by anyone. [optional; default 0]
        uint64 expiry;       // The Unix timestamp in seconds when this order expires. [required]
        uint256 salt;        // Arbitrary number to enforce uniqueness of the order hash. [required]
    }

    struct LimitOrder {
        address makerToken;
        address takerToken;
        uint128 makerAmount;
        uint128 takerAmount;
        uint128 takerTokenFeeAmount;
        address maker;
        address taker;
        address sender;
        address feeRecipient;
        bytes32 pool;
        uint64 expiry;
        uint256 salt;
    }
    
    struct Signature {
        uint8 signatureType; // Either 2 or 3
        uint8 v;             // Signature data.
        bytes32 r;           // Signature data.
        bytes32 s;           // Signature data.
    }

    enum OrderStatus {
        INVALID,
        FILLABLE,
        FILLED,
        CANCELLED,
        EXPIRED
    }

    struct OrderInfo {        
        bytes32 orderHash;              // The order hash.        
        OrderStatus status;             // Current state of the order.        
        uint128 takerTokenFilledAmount; // How much taker token has been filled in the order.
    }

    function getRfqOrderInfo(RfqOrder calldata) external view returns (OrderInfo memory);

    function getRfqOrderHash(RfqOrder calldata) external view returns (bytes32);

    function registerAllowedRfqOrigins(address[] memory, bool) external;

    function cancelRfqOrder(RfqOrder calldata) external;

    function fillRfqOrder(        
        RfqOrder calldata, // The order        
        Signature calldata,// The signature        
        uint128            // How much taker token to fill the order with
    )
        external       
        returns (uint128, uint128);//takerTokenFillAmount, makerTokenFillAmount

    

    function getLimitOrderInfo(LimitOrder calldata order) external view returns (OrderInfo memory orderInfo);

    function getLimitOrderHash(LimitOrder calldata order) external view returns (bytes32 orderHash);

    function cancelLimitOrder(LimitOrder calldata order) external;

    function fillLimitOrder(
        LimitOrder calldata order,
        Signature calldata signature,
        uint128 takerTokenFillAmount
    )
        external
        returns (uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount);

    function getLimitOrderRelevantState(
        LimitOrder calldata order,
        Signature calldata signature
    )
        external
        view
        returns (
            OrderInfo memory orderInfo,
            uint128 actualFillableTakerTokenAmount,
            bool isSignatureValid
        );

    
    function registerAllowedOrderSigner(address signer, bool isAllowed) external;// signer

    function isValidOrderSigner(address maker, address signer) external view returns (bool isAllowed);        
}
