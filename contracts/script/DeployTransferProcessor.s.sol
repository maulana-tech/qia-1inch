// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockTransferVerifier.sol";
import "../src/TransferProcessor.sol";

contract DeployTransferProcessorScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy mock verifier (always returns true)
        MockTransferVerifier mockVerifier = new MockTransferVerifier();
        console.log("MockTransferVerifier deployed at:", address(mockVerifier));

        // Deploy transfer processor
        TransferProcessor processor = new TransferProcessor(address(mockVerifier));
        console.log("TransferProcessor deployed at:", address(processor));

        vm.stopBroadcast();
    }
}
