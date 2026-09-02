// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

struct TeeInstructionParams {
    bytes32 opType;
    bytes32 opCommand;
    bytes message;
    address[] cosigners;
    uint64 cosignersThreshold;
    address claimBackAddress;
}

interface ITeeExtensionRegistry {
    function sendInstructions(address[] calldata _teeIds, TeeInstructionParams calldata _params) external payable returns (bytes32 instructionId);
}

contract LarelInstructionSender {
    ITeeExtensionRegistry public immutable teeRegistry;
    uint256 public extensionId;
    
    // OP Identifiers that must exactly match the Go handler config
    bytes32 public constant OP_TYPE_LAREL = bytes32("LAREL_POOL");
    bytes32 public constant OP_COMMAND_PLACE_ORDER = bytes32("PLACE_ORDER");

    event OrderPlaced(bytes32 indexed instructionId, address indexed sender);

    constructor(address _teeRegistry, uint256 _extensionId) {
        teeRegistry = ITeeExtensionRegistry(_teeRegistry);
        extensionId = _extensionId;
    }

    /// @notice Submit an encrypted order to the TEE matcher
    /// @param teeAddresses Array of TEE machine addresses to send to (can be fetched from TeeMachineRegistry)
    /// @param encryptedOrder The user's ECIES-encrypted order payload
    function placeOrder(
        address[] calldata teeAddresses,
        bytes calldata encryptedOrder
    ) external payable returns (bytes32) {
        
        address[] memory cosigners = new address[](0);

        TeeInstructionParams memory params = TeeInstructionParams({
            opType: OP_TYPE_LAREL,
            opCommand: OP_COMMAND_PLACE_ORDER,
            message: encryptedOrder,
            cosigners: cosigners,
            cosignersThreshold: 0,
            claimBackAddress: msg.sender
        });

        // Forward msg.value to cover Flare network instruction fees
        bytes32 instructionId = teeRegistry.sendInstructions{value: msg.value}(
            teeAddresses,
            params
        );

        emit OrderPlaced(instructionId, msg.sender);
        return instructionId;
    }
}
