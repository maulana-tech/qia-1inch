// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SimpleAMM.sol";
import "../src/MockERC20.sol";

contract DeployAMMScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        // Deploy mock tokens
        MockERC20 usdc = new MockERC20("Test USD Coin", "USDC", 7);
        MockERC20 eth = new MockERC20("Test Ethereum", "ETH", 7);
        MockERC20 btc = new MockERC20("Test Bitcoin", "BTC", 7);
        MockERC20 xrp = new MockERC20("Test XRP", "XRP", 7);
        
        console.log("MockUSDC:", address(usdc));
        console.log("MockETH:", address(eth));
        console.log("MockBTC:", address(btc));
        console.log("MockXRP:", address(xrp));

        // Deploy AMM pools
        SimpleAMM amm_flr_usdc = new SimpleAMM(address(0), address(usdc));
        SimpleAMM amm_flr_eth = new SimpleAMM(address(0), address(eth));
        SimpleAMM amm_flr_btc = new SimpleAMM(address(0), address(btc));
        SimpleAMM amm_flr_xrp = new SimpleAMM(address(0), address(xrp));
        SimpleAMM amm_usdc_eth = new SimpleAMM(address(usdc), address(eth));
        
        console.log("AMM FLR/USDC:", address(amm_flr_usdc));
        console.log("AMM FLR/ETH:", address(amm_flr_eth));
        console.log("AMM FLR/BTC:", address(amm_flr_btc));
        console.log("AMM FLR/XRP:", address(amm_flr_xrp));
        console.log("AMM USDC/ETH:", address(amm_usdc_eth));

        // Mint tokens for liquidity
        uint256 liquidityAmount = 100000 * 10**7; // 100k tokens
        
        usdc.mint(deployer, liquidityAmount);
        eth.mint(deployer, liquidityAmount);
        btc.mint(deployer, liquidityAmount);
        xrp.mint(deployer, liquidityAmount);
        
        // Approve AMM contracts
        usdc.approve(address(amm_flr_usdc), liquidityAmount);
        eth.approve(address(amm_flr_eth), liquidityAmount);
        btc.approve(address(amm_flr_btc), liquidityAmount);
        xrp.approve(address(amm_flr_xrp), liquidityAmount);
        usdc.approve(address(amm_usdc_eth), liquidityAmount);
        eth.approve(address(amm_usdc_eth), liquidityAmount);
        
        // Add initial liquidity
        amm_flr_usdc.addLiquidity{value: 10 * 10**18}(10 * 10**18, 333 * 10**7);
        amm_flr_eth.addLiquidity{value: 10 * 10**18}(10 * 10**18, 8 * 10**7);
        amm_flr_btc.addLiquidity{value: 10 * 10**18}(10 * 10**18, 1 * 10**7);
        amm_flr_xrp.addLiquidity{value: 10 * 10**18}(10 * 10**18, 50 * 10**7);
        amm_usdc_eth.addLiquidity(1000 * 10**7, 28 * 10**7);

        vm.stopBroadcast();
    }
}
