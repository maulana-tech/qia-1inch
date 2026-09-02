// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/IqiaPool.sol";
import "../src/HonkVerifier.sol";
import "../src/MockERC20.sol";

contract MockPoseidon is IPoseidon {
    function hash(uint256[2] memory inputs) external view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(inputs[0], inputs[1])));
    }
}

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Poseidon
        MockPoseidon poseidon = new MockPoseidon();
        console.log("MockPoseidon deployed at:", address(poseidon));

        // 2. Deploy Verifier
        WithdrawVerifier verifier = new WithdrawVerifier();
        console.log("WithdrawVerifier deployed at:", address(verifier));

        // 3. Deploy IqiaPool
        IqiaPool pool = new IqiaPool(address(poseidon), address(verifier));
        console.log("IqiaPool deployed at:", address(pool));

        // 4. Deploy mock ERC20 tokens for the faucet
        MockERC20 usdc = new MockERC20("Test USD Coin", "USDC", 7);
        console.log("MockUSDC deployed at:", address(usdc));

        MockERC20 eth = new MockERC20("Test Ethereum", "ETH", 7);
        console.log("MockETH deployed at:", address(eth));

        MockERC20 btc = new MockERC20("Test Bitcoin", "BTC", 7);
        console.log("MockBTC deployed at:", address(btc));

        MockERC20 xrp = new MockERC20("Test XRP", "XRP", 7);
        console.log("MockXRP deployed at:", address(xrp));

        vm.stopBroadcast();
    }
}
