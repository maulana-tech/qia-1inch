// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TransferProcessor
 * @notice Processes private transfers using ZK proofs.
 *         Verifies the proof and updates the commitment tree.
 */
contract TransferProcessor {
    // Verifier interface
    IVerifier public immutable verifier;
    
    // Commitment tracking
    mapping(bytes32 => bool) public commitments;
    mapping(bytes32 => bool) public nullifiers;
    
    // Events
    event Transfer(
        bytes32 indexed nullifier0,
        bytes32 indexed nullifier1,
        bytes32 outputCommitment0,
        bytes32 outputCommitment1
    );
    
    error InvalidProof();
    error NullifierAlreadyUsed();
    error CommitmentAlreadyExists();
    
    constructor(address _verifier) {
        verifier = IVerifier(_verifier);
    }
    
    /**
     * @notice Process a private transfer
     * @param proof The ZK proof bytes
     * @param publicInputs Public inputs to the proof [merkle_root, nullifier_0, nullifier_1, out_commitment_0, out_commitment_1, ext_data_hash]
     */
    function transfer(
        bytes calldata proof,
        bytes32[6] calldata publicInputs
    ) external {
        bytes32 nullifier0 = publicInputs[1];
        bytes32 nullifier1 = publicInputs[2];
        bytes32 outCommitment0 = publicInputs[3];
        bytes32 outCommitment1 = publicInputs[4];
        
        // Check nullifiers not already used
        if (nullifiers[nullifier0]) revert NullifierAlreadyUsed();
        if (nullifier0 != nullifier1 && nullifiers[nullifier1]) revert NullifierAlreadyUsed();
        
        // Check output commitments don't already exist
        if (commitments[outCommitment0]) revert CommitmentAlreadyExists();
        if (outCommitment0 != outCommitment1 && commitments[outCommitment1]) revert CommitmentAlreadyExists();
        
        // Verify the ZK proof
        bytes32[] memory pubInputs = new bytes32[](6);
        for (uint i = 0; i < 6; i++) {
            pubInputs[i] = publicInputs[i];
        }
        
        bool valid = verifier.verify(proof, pubInputs);
        if (!valid) revert InvalidProof();
        
        // Mark nullifiers as used
        nullifiers[nullifier0] = true;
        if (nullifier0 != nullifier1) {
            nullifiers[nullifier1] = true;
        }
        
        // Store output commitments
        commitments[outCommitment0] = true;
        if (outCommitment0 != outCommitment1) {
            commitments[outCommitment1] = true;
        }
        
        emit Transfer(nullifier0, nullifier1, outCommitment0, outCommitment1);
    }
}

interface IVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external returns (bool);
}
