// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SimpleAMM.sol";
import "../src/MockERC20.sol";

/// @notice Deploys the faucet tokens and the interim SimpleAMM pools.
/// @dev    SimpleAMM is scheduled for removal — liquidity moves to Aqua + SwapVM.
///         See docs/migrasi.md. Mocks keep 7 decimals so amounts stay inside the
///         64-bit range the Noir circuits assert on (see assert_64 in iqia_lib).
contract DeployAMMScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        MockERC20 usdc = new MockERC20("Test USD Coin", "USDC", 7);
        MockERC20 wbtc = new MockERC20("Test Wrapped Bitcoin", "WBTC", 7);
        MockERC20 dai = new MockERC20("Test Dai", "DAI", 7);

        console.log("MockUSDC:", address(usdc));
        console.log("MockWBTC:", address(wbtc));
        console.log("MockDAI:", address(dai));

        // address(0) is the native token of the target chain.
        SimpleAMM ammEthUsdc = new SimpleAMM(address(0), address(usdc));
        SimpleAMM ammEthWbtc = new SimpleAMM(address(0), address(wbtc));
        SimpleAMM ammUsdcWbtc = new SimpleAMM(address(usdc), address(wbtc));
        SimpleAMM ammUsdcDai = new SimpleAMM(address(usdc), address(dai));

        console.log("AMM ETH/USDC:", address(ammEthUsdc));
        console.log("AMM ETH/WBTC:", address(ammEthWbtc));
        console.log("AMM USDC/WBTC:", address(ammUsdcWbtc));
        console.log("AMM USDC/DAI:", address(ammUsdcDai));

        uint256 liquidityAmount = 100_000 * 10 ** 7;

        usdc.mint(deployer, liquidityAmount * 3);
        wbtc.mint(deployer, liquidityAmount * 2);
        dai.mint(deployer, liquidityAmount);

        usdc.approve(address(ammEthUsdc), liquidityAmount);
        wbtc.approve(address(ammEthWbtc), liquidityAmount);
        usdc.approve(address(ammUsdcWbtc), liquidityAmount);
        wbtc.approve(address(ammUsdcWbtc), liquidityAmount);
        usdc.approve(address(ammUsdcDai), liquidityAmount);
        dai.approve(address(ammUsdcDai), liquidityAmount);

        // Rough spot rates: ETH 3500, WBTC 65000, USDC 1, DAI 1.
        ammEthUsdc.addLiquidity{ value: 1 ether }(1 ether, 3_500 * 10 ** 7);
        ammEthWbtc.addLiquidity{ value: 1 ether }(1 ether, 5 * 10 ** 6); // 0.5 WBTC-ish
        ammUsdcWbtc.addLiquidity(65_000 * 10 ** 7, 1 * 10 ** 7);
        ammUsdcDai.addLiquidity(10_000 * 10 ** 7, 10_000 * 10 ** 7);

        vm.stopBroadcast();
    }
}
