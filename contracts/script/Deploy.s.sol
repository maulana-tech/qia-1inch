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

        MockERC20 wbtc = new MockERC20("Test Wrapped Bitcoin", "WBTC", 7);
        console.log("MockWBTC deployed at:", address(wbtc));

        MockERC20 dai = new MockERC20("Test Dai", "DAI", 7);
        console.log("MockDAI deployed at:", address(dai));

        vm.stopBroadcast();
    }
}
