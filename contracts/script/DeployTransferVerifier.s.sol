// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/TransferVerifier.sol";

contract DeployTransferVerifierScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        TransferVerifier verifier = new TransferVerifier();
        console.log("TransferVerifier deployed at:", address(verifier));

        vm.stopBroadcast();
    }
}
