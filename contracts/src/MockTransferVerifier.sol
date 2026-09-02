// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockTransferVerifier
 * @notice Mock verifier for testing - always returns true.
 *         Replace with real TransferVerifier for production.
 */
contract MockTransferVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}
