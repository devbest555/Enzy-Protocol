// SPDX-License-Identifier: GPL-3.0



pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IZeroExV4.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../../../utils/FundDeployerOwnerMixin.sol";
import "../utils/AdapterBase.sol";
import "hardhat/console.sol";

/// @title ZeroExV4Adapter Contract
/// @notice Adapter to 0x V4 Exchange Contract
contract ZeroExV4Adapter is AdapterBase, FundDeployerOwnerMixin {
    using AddressArrayLib for address[];
    using SafeMath for uint256;
    using SafeMath for uint128;

    event AllowedMakerAdded(address indexed account);

    event AllowedMakerRemoved(address indexed account);

    address private immutable EXCHANGE;
    mapping(address => bool) private makerToIsAllowed;

    // Gas could be optimized for the end-user by also storing an immutable ZRX_ASSET_DATA,
    // for example, but in the narrow OTC use-case of this adapter, taker fees are unlikely.
    constructor(
        address _integrationManager,
        address _exchange,
        address _fundDeployer,
        address[] memory _allowedMakers
    ) public AdapterBase(_integrationManager) FundDeployerOwnerMixin(_fundDeployer) {
        EXCHANGE = _exchange;
        if (_allowedMakers.length > 0) {
            __addAllowedMakers(_allowedMakers);
        }
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "ZERO_EX_V4";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    // function parseAssetsForMethodUint128(bytes4 _selector, bytes calldata _encodedCallArgs)
    //     external
    //     returns (
    //         IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
    //         address[] memory spendAssets_,
    //         uint128[] memory spendAssetAmounts_,
    //         address[] memory incomingAssets_,
    //         uint128[] memory minIncomingAssetAmounts_
    //     )
    // {
    //     require(_selector == TAKE_ORDER_SELECTOR, "parseAssetsForMethod: _selector invalid");

    //     (
    //         bytes memory orderArgs,
    //         ,
    //         uint128 takerAssetFillAmount
    //     ) = __decodeTakeOrderCallArgs(_encodedCallArgs);

    //     IZeroExV4.LimitOrder memory order = __constructOrderStruct(orderArgs);
        
    //     IZeroExV4(EXCHANGE).registerAllowedOrderSigner(order.maker, true);

    //     require(
    //         takerAssetFillAmount <= order.takerAmount,
    //         "parseAssetsForMethod: Taker asset fill amount greater than available"
    //     );

    //     // Format incoming assets
    //     incomingAssets_ = new address[](1);
    //     incomingAssets_[0] = order.makerToken;
    //     minIncomingAssetAmounts_ = new uint128[](1);
    //     minIncomingAssetAmounts_[0] = uint128(takerAssetFillAmount.mul(order.makerAmount).div(order.takerAmount));

    //     spendAssets_ = new address[](1);
    //     spendAssets_[0] = order.takerToken;

    //     spendAssetAmounts_ = new uint128[](1);
    //     spendAssetAmounts_[0] = takerAssetFillAmount;

    //     return (
    //         IIntegrationManager.SpendAssetsHandleType.Transfer,
    //         spendAssets_,
    //         spendAssetAmounts_,
    //         incomingAssets_,
    //         minIncomingAssetAmounts_
    //     );
    // }

    function parseAssetsForMethod(bytes4, bytes calldata)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType,
            address[] memory,
            uint256[] memory,
            address[] memory,
            uint256[] memory
        )
    {
    }

    /// @notice Take an order on 0x
    function fillOrderZeroEX(bytes calldata _orderArgs, bytes calldata _signatureArgs, uint128 _takerAssetFillAmount)
        external
        override
        returns (uint128 amount_)
    {
        IZeroExV4.LimitOrder memory order = __constructOrderStruct(_orderArgs);
        
        IZeroExV4(EXCHANGE).registerAllowedOrderSigner(order.maker, true);

        // Approve spend assets as needed
        __approveMaxAsNeeded(
            order.takerToken,
            EXCHANGE,
            _takerAssetFillAmount
        );
        
        IZeroExV4(EXCHANGE).registerAllowedOrderSigner(order.maker, true);
        
        require(
            isAllowedMaker(order.maker),
            "parseAssetsForMethod: Order maker is not allowed"
        );

        require(
            _takerAssetFillAmount <= order.takerAmount,
            "fillOrderZeroEX: Taker asset fill amount greater than available"
        );

        // Execute order        
        IZeroExV4.Signature memory signature = __getSignatureStruct(_signatureArgs);
        (
            uint128 takerTokenFillAmount, 
            uint128 makerTokenFillAmount
        ) = IZeroExV4(EXCHANGE).fillLimitOrder(order, signature, _takerAssetFillAmount);

        return takerTokenFillAmount;
    }

    // PRIVATE FUNCTIONS

    /// @dev Parses user inputs into a ZeroExV4.RfqOrder format
    function __constructOrderStruct(bytes memory _encodedOrderArgs)
        private
        pure
        returns (IZeroExV4.LimitOrder memory order_)
    {
        (
            address[6] memory orderAddresses,
            uint128[3] memory orderAmounts,
            bytes32 pool,
            uint64 expiry,
            uint256 salt
        ) = __decodeZeroExOrderArgs(_encodedOrderArgs);

        return
            IZeroExV4.LimitOrder({                
                makerToken: orderAddresses[0],
                takerToken: orderAddresses[1],
                makerAmount: orderAmounts[0],
                takerAmount: orderAmounts[1],
                takerTokenFeeAmount: orderAmounts[2],
                maker: orderAddresses[2],     
                taker: orderAddresses[3],          
                sender: orderAddresses[4],
                feeRecipient: orderAddresses[5],                                   
                pool: pool,      
                expiry: expiry,
                salt: salt
            });
    }

    /// @dev Parses user inputs into a ZeroExV4.Signature format
    function __getSignatureStruct(bytes memory _encodedArgs)
        private
        pure
        returns (IZeroExV4.Signature memory signature_)
    {
        (
            uint8 v,
            bytes32 r,
            bytes32 s
        ) = abi.decode(_encodedArgs, (uint8, bytes32, bytes32));

        return
            IZeroExV4.Signature({                
                signatureType: 3, // Either 2(EIP712) or 3(EthSign)
                v: v,
                r: r,           
                s: s   
            });
    }

    /// @dev Decode the parameters of a takeOrder call
    function __decodeTakeOrderCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (bytes memory encodedZeroExOrderArgs_, bytes memory encodedZeroExSignatureArgs_, uint128 takerAssetFillAmount_)
    {
        return abi.decode(_encodedCallArgs, (bytes, bytes, uint128));
    }

    /// @dev Decode the parameters of a 0x RFQ Order
    /// @param _encodedZeroExOrderArgs Encoded parameters of the 0x RFQ Order
    function __decodeZeroExOrderArgs(bytes memory _encodedZeroExOrderArgs)
        private
        pure
        returns (
            address[6] memory orderAddresses_,
            uint128[3] memory orderAmounts_,
            bytes32 pool_,
            uint64 expiry_,
            uint256 salt_
        )
    {
        return abi.decode(_encodedZeroExOrderArgs, (address[6], uint128[3], bytes32, uint64, uint256));
    }    

    /// @dev Gets the 0x assetProxy address for an ERC20 token
    // function __getAssetProxy(bytes memory _assetData) private view returns (address assetProxy_) {
    //     bytes4 assetProxyId;

    //     assembly {
    //         assetProxyId := and(
    //             mload(add(_assetData, 32)),
    //             0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
    //         )
    //     }
    //     assetProxy_ = IZeroExV4(EXCHANGE).getAssetProxy(assetProxyId);
    // }

    /////////////////////////////
    // ALLOWED MAKERS REGISTRY //
    /////////////////////////////

    /// @notice Adds accounts to the list of allowed 0x order makers
    /// @param _accountsToAdd Accounts to add
    function addAllowedMakers(address[] calldata _accountsToAdd) external onlyFundDeployerOwner {
        __addAllowedMakers(_accountsToAdd);
    }

    /// @notice Removes accounts from the list of allowed 0x order makers
    /// @param _accountsToRemove Accounts to remove
    function removeAllowedMakers(address[] calldata _accountsToRemove)
        external
        onlyFundDeployerOwner
    {
        require(_accountsToRemove.length > 0, "removeAllowedMakers: Empty _accountsToRemove");

        for (uint256 i; i < _accountsToRemove.length; i++) {
            require(
                isAllowedMaker(_accountsToRemove[i]),
                "removeAllowedMakers: Account is not an allowed maker"
            );

            makerToIsAllowed[_accountsToRemove[i]] = false;

            emit AllowedMakerRemoved(_accountsToRemove[i]);
        }
    }

    /// @dev Helper to add accounts to the list of allowed makers
    function __addAllowedMakers(address[] memory _accountsToAdd) private {
        require(_accountsToAdd.length > 0, "__addAllowedMakers: Empty _accountsToAdd");

        for (uint256 i; i < _accountsToAdd.length; i++) {
            require(!isAllowedMaker(_accountsToAdd[i]), "__addAllowedMakers: Value already set");

            makerToIsAllowed[_accountsToAdd[i]] = true;

            emit AllowedMakerAdded(_accountsToAdd[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `EXCHANGE` variable value
    /// @return exchange_ The `EXCHANGE` variable value
    function getExchange() external view returns (address exchange_) {
        return EXCHANGE;
    }

    /// @notice Checks whether an account is an allowed maker of 0x orders
    /// @param _who The account to check
    /// @return isAllowedMaker_ True if _who is an allowed maker
    function isAllowedMaker(address _who) public view returns (bool isAllowedMaker_) {
        return makerToIsAllowed[_who];
    }
}
