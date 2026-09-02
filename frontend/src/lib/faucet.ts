import { type WalletClient, type PublicClient, parseAbi } from 'viem'

/**
 * Faucet mints mock tokens (ERC20) to the connected wallet on the EVM network.
 */
export async function faucetMint(
  tokenAddress: string,
  amount: bigint,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<string> {
  if (!walletClient.account) {
    throw new Error('Wallet client has no connected account.')
  }
  
  const toAddress = walletClient.account.address
  
  const hash = await walletClient.writeContract({
    address: tokenAddress as `0x${string}`,
    abi: parseAbi(['function mint(address to, uint256 amount) public']),
    functionName: 'mint',
    args: [toAddress, amount],
    chain: walletClient.chain ?? null,
    account: walletClient.account,
  })
  
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}
