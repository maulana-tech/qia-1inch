// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SimpleAMM
 * @notice Simple Uniswap V2 style AMM for Larel testnet.
 *         Supports token swaps with constant product formula (x * y = k).
 */
contract SimpleAMM {
    // Token addresses
    address public tokenA;
    address public tokenB;
    
    // Reserves
    uint256 public reserveA;
    uint256 public reserveB;
    
    // LP token tracking
    mapping(address => uint256) public liquidity;
    uint256 public totalLiquidity;
    
    // Events
    event Swap(address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut);
    event AddLiquidity(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityMinted);
    event RemoveLiquidity(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityBurned);
    
    error InsufficientLiquidity();
    error InsufficientAmount();
    error InvalidToken();
    error TransferFailed();
    
    constructor(address _tokenA, address _tokenB) {
        tokenA = _tokenA;
        tokenB = _tokenB;
    }
    
    /**
     * @notice Add liquidity to the pool
     * @param amountA Amount of token A to add
     * @param amountB Amount of token B to add
     */
    function addLiquidity(uint256 amountA, uint256 amountB) external payable {
        if (amountA == 0 || amountB == 0) revert InsufficientAmount();
        
        // Handle native FLR (address(0))
        if (tokenA == address(0)) {
            require(msg.value == amountA, "Incorrect FLR amount");
        } else {
            _transferFrom(tokenA, msg.sender, address(this), amountA);
        }
        
        if (tokenB == address(0)) {
            require(msg.value == amountB, "Incorrect FLR amount");
        } else {
            _transferFrom(tokenB, msg.sender, address(this), amountB);
        }
        
        // Calculate LP tokens to mint
        uint256 liquidityMinted;
        if (totalLiquidity == 0) {
            liquidityMinted = sqrt(amountA * amountB);
        } else {
            liquidityMinted = min(
                (amountA * totalLiquidity) / reserveA,
                (amountB * totalLiquidity) / reserveB
            );
        }
        
        // Update reserves
        reserveA += amountA;
        reserveB += amountB;
        
        // Mint LP tokens
        liquidity[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;
        
        emit AddLiquidity(msg.sender, amountA, amountB, liquidityMinted);
    }
    
    /**
     * @notice Remove liquidity from the pool
     * @param liquidityAmount Amount of LP tokens to burn
     */
    function removeLiquidity(uint256 liquidityAmount) external {
        if (liquidity[msg.sender] < liquidityAmount) revert InsufficientAmount();
        
        // Calculate token amounts
        uint256 amountA = (liquidityAmount * reserveA) / totalLiquidity;
        uint256 amountB = (liquidityAmount * reserveB) / totalLiquidity;
        
        // Burn LP tokens
        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        
        // Update reserves
        reserveA -= amountA;
        reserveB -= amountB;
        
        // Transfer tokens back (handle native FLR)
        if (tokenA == address(0)) {
            (bool success, ) = msg.sender.call{value: amountA}("");
            if (!success) revert TransferFailed();
        } else {
            _transfer(tokenA, msg.sender, amountA);
        }
        
        if (tokenB == address(0)) {
            (bool success, ) = msg.sender.call{value: amountB}("");
            if (!success) revert TransferFailed();
        } else {
            _transfer(tokenB, msg.sender, amountB);
        }
        
        emit RemoveLiquidity(msg.sender, amountA, amountB, liquidityAmount);
    }
    
    /**
     * @notice Swap tokens
     * @param tokenIn Address of token to swap in
     * @param amountIn Amount of token to swap in
     * @param minAmountOut Minimum amount of token to receive
     */
    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut) external payable returns (uint256 amountOut) {
        if (amountIn == 0) revert InsufficientAmount();
        
        bool isA = tokenIn == tokenA;
        if (!isA && tokenIn != tokenB) revert InvalidToken();
        
        uint256 reserveIn = isA ? reserveA : reserveB;
        uint256 reserveOut = isA ? reserveB : reserveA;
        address tokenOut = isA ? tokenB : tokenA;
        
        // Calculate output amount using constant product formula
        amountOut = (reserveOut * amountIn) / (reserveIn + amountIn);
        
        if (amountOut < minAmountOut) revert InsufficientLiquidity();
        
        // Handle native FLR
        if (tokenIn == address(0)) {
            require(msg.value == amountIn, "Incorrect FLR amount");
        } else {
            _transferFrom(tokenIn, msg.sender, address(this), amountIn);
        }
        
        if (tokenOut == address(0)) {
            (bool success, ) = msg.sender.call{value: amountOut}("");
            if (!success) revert TransferFailed();
        } else {
            _transfer(tokenOut, msg.sender, amountOut);
        }
        
        // Update reserves
        if (isA) {
            reserveA += amountIn;
            reserveB -= amountOut;
        } else {
            reserveB += amountIn;
            reserveA -= amountOut;
        }
        
        emit Swap(tokenIn, amountIn, tokenOut, amountOut);
    }
    
    /**
     * @notice Get estimated output amount for a swap
     * @param tokenIn Address of token to swap in
     * @param amountIn Amount of token to swap in
     */
    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256) {
        bool isA = tokenIn == tokenA;
        if (!isA && tokenIn != tokenB) revert InvalidToken();
        
        uint256 reserveIn = isA ? reserveA : reserveB;
        uint256 reserveOut = isA ? reserveB : reserveA;
        
        return (reserveOut * amountIn) / (reserveIn + amountIn);
    }
    
    /**
     * @notice Get current reserves
     */
    function getReserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }
    
    // Internal transfer functions (simplified - assumes ERC20)
    function _transferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, ) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        if (!success) revert TransferFailed();
    }
    
    function _transfer(address token, address to, uint256 amount) internal {
        (bool success, ) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        if (!success) revert TransferFailed();
    }
    
    // Math helpers
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
    
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
