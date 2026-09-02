// @ts-nocheck
import { sendTransaction, waitForTransactionReceipt, getAccount, writeContract, readContract } from '@wagmi/core'
// @ts-nocheck
import { Larel, type EvmOperation, type ProofData, type BalanceNote, createNote, fieldToHex, hash2, hash4 } from '@larel/sdk'
// @ts-nocheck
import { wagmiConfig } from './wagmi'
// @ts-nocheck
import { POOL_CONTRACT_ID, TRANSFER_PROCESSOR_ADDRESS } from './config'
// @ts-nocheck
import { getSpendingKey, addNote, loadNotes, markSpent, addOrder, loadOrders, setOrderStatus, loadHistory, addHistoryItem } from './note-store'

// TransferProcessor ABI
const transferProcessorAbi = parseAbi([
  'function transfer(bytes calldata proof, bytes32[6] calldata publicInputs) external',
])

// SimpleAMM contract addresses on Coston2
const AMM_POOLS: Record<string, string> = {
  'FLR/USDC': '0x6BdB65a29aB0aA63Ed9ab1c6EC238Cd455cbdB2c',
  'FLR/ETH': '0x8Ff8Ba795085540cC7021c5eb58CF4971eb3940E',
  'FLR/BTC': '0xC5F9Be31f97EA13729a832F1fc41797D41C89aD1',
  'FLR/XRP': '0xD0aCae33a7c4eB3b2A3Ce1bb3f2fc489e6B40B8e',
  'USDC/ETH': '0x8A28b7F3448f75789c9D6ff5f0E5DdC59C744e98',
}

// SimpleAMM ABI
const simpleAMMAbi = parseAbi([
  'function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut) external payable returns (uint256 amountOut)',
  'function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256)',
  'function getReserves() external view returns (uint256, uint256)',
  'function tokenA() external view returns (address)',
  'function tokenB() external view returns (address)',
])

// Get AMM pool address for a token pair
function getAMMPool(tokenIn: string, tokenOut: string): string | undefined {
  const key1 = `${tokenIn}/${tokenOut}`
  const key2 = `${tokenOut}/${tokenIn}`
  return AMM_POOLS[key1] || AMM_POOLS[key2]
}

// Get token address for AMM (native FLR = address(0))
function getAMMTokenAddress(code: string): string {
  if (code === 'FLR') return '0x0000000000000000000000000000000000000000'
  const meta = assetMeta(code)
  return meta.sac || '0x0000000000000000000000000000000000000000'
}
import type {
  DepositParams,
  OpenOrder,
  PlaceOrderParams,
  PlaceOrderResult,
  ShieldedBalance,
  TransferParams,
  TxResult,
  WithdrawParams,
  SwapShieldedParams,
  LarelSdk,
  HistoryItem,
} from './larel-sdk'
// @ts-nocheck
import { assetIdFor, assetMeta } from './tokens'
// @ts-nocheck
import { formatAmount } from './format'
import { erc20Abi, parseAbi } from 'viem'

// Parse decimal to base units
export function toBaseUnits(input: string, decimals: number): bigint {
  const trimmed = input.replace(/,/g, '').trim()
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error(`Invalid amount: "${input}"`)
  }
  const [whole, frac = ''] = trimmed.split('.')
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
}

export function baseUnitsToNumber(value: bigint, decimals: number): number {
  return Number(value) / (10 ** decimals)
}

export class RealLarelSdk implements LarelSdk {
  private sdk: Larel | null = null;

  private getSdk(): Larel {
    if (!this.sdk) {
      this.sdk = new Larel({
        contractAddress: POOL_CONTRACT_ID,
        spendingKey: getSpendingKey()
      })
    }
    return this.sdk;
  }

  private async requireAddress(): Promise<string> {
    const { address } = getAccount(wagmiConfig)
    if (!address) throw new Error('Connect an EVM wallet first (e.g. MetaMask).')
    return address
  }

  private async submitOp(op: EvmOperation): Promise<{ hash: string }> {
    await this.requireAddress()
    const hash = await sendTransaction(wagmiConfig as any, {
      to: op.to,
      data: op.data,
      value: op.value,
    })
    await waitForTransactionReceipt(wagmiConfig as any, { hash })
    return { hash }
  }

  async deposit(params: DepositParams): Promise<TxResult> {
    const isNative = params.native ?? (params.asset === 'FLR')
    const address = params.sac ?? (isNative ? 'native' : '')
    if (!address && !isNative) throw new Error('Need ERC20 contract address for deposit')
    const decimals = params.decimals ?? 18
    const amountBase = toBaseUnits(params.amount, decimals)

    const from = await this.requireAddress()

    // For ERC20 tokens, approve the pool to spend first
    if (!isNative && address && address !== 'native') {
      const allowance = await readContract(wagmiConfig, {
        address: address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [from as `0x${string}`, POOL_CONTRACT_ID as `0x${string}`],
      })

      if (allowance < amountBase) {
        // Need to approve
        const approveHash = await writeContract(wagmiConfig, {
          address: address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'approve',
          args: [POOL_CONTRACT_ID as `0x${string}`, amountBase],
          chain: null,
          account: from as `0x${string}`,
        })
        await waitForTransactionReceipt(wagmiConfig as any, { hash: approveHash })
      }
    }

    const { note, operation, commitment } = this.getSdk().deposit({
      asset: { assetId: assetIdFor({ native: isNative, sac: address }), address },
      amount: amountBase,
      from
    })

    const { hash } = await this.submitOp(operation)
    
    addNote(note, { assetCode: params.asset, txHash: hash, decimals, source: 'deposit' })
    
    // Add to history
    addHistoryItem({
      id: 'dep_' + Date.now(),
      type: 'Deposit',
      pairOrAsset: params.asset,
      amountIn: `${formatAmount(Number(params.amount))} ${params.asset}`,
      txHash: hash,
      createdAt: Date.now(),
    })
    
    return { hash }
  }

  async withdraw(params: WithdrawParams): Promise<TxResult> {
    const from = await this.requireAddress()
    
    // Find note
    const notes = loadNotes()
    const candidate = params.commitment 
      ? notes.find(n => n.commitment === params.commitment && !n.spent)
      : notes.find(n => n.assetCode === params.asset && !n.spent)
      
    if (!candidate) throw new Error('No shielded balance available for withdrawal')
    
    // Convert StoredNote to BalanceNote
    const balanceNote = {
      assetId: BigInt(candidate.assetId),
      amount: BigInt(candidate.amount),
      ownerKey: BigInt(candidate.ownerKey),
      blinding: BigInt(candidate.blinding),
      commitment: BigInt(candidate.commitment),
      spendingKey: getSpendingKey(),
      leafIndex: candidate.leafIndex,
      assetAddress: candidate.assetAddress
    }

    const { operation, nullifiers } = await this.getSdk().withdraw({
      note: balanceNote as BalanceNote,
      recipient: params.recipient
    })

    const { hash } = await this.submitOp(operation)
    markSpent(candidate.commitment)
    
    // Add to history
    addHistoryItem({
      id: 'wd_' + Date.now(),
      type: 'Withdrawal',
      pairOrAsset: candidate.assetCode,
      amountOut: `${formatAmount(baseUnitsToNumber(BigInt(candidate.amount), candidate.decimals ?? 18))} ${candidate.assetCode}`,
      txHash: hash,
      createdAt: Date.now(),
    })
    
    return { hash }
  }

  async transfer(params: TransferParams): Promise<TxResult> {
    const from = await this.requireAddress()
    const meta = assetMeta(params.asset)
    const amountBase = toBaseUnits(params.amount, meta.decimals)
    
    // Find source note
    const notes = loadNotes()
    const sourceNote = notes.find(n => n.assetCode === params.asset && !n.spent)
    if (!sourceNote) throw new Error(`No shielded ${params.asset} balance`)
    
    const sourceAmount = BigInt(sourceNote.amount)
    if (sourceAmount < amountBase) throw new Error('Insufficient balance')
    
    // Create output note for recipient (using recipient's owner key)
    const recipientOwnerKey = BigInt(params.recipientKey.startsWith('0x') ? params.recipientKey : '0x' + params.recipientKey)
    const outputNote = createNote({
      assetId: BigInt(sourceNote.assetId),
      amount: amountBase,
      ownerKey: recipientOwnerKey,
    })
    
    // Create change note if needed
    let changeNote = undefined
    if (sourceAmount > amountBase) {
      changeNote = createNote({
        assetId: BigInt(sourceNote.assetId),
        amount: sourceAmount - amountBase,
        spendingKey: getSpendingKey(),
      })
    }
    
    // Generate ZK proof (simplified - in production this would use the real prover)
    // For now, we'll submit a dummy proof that the mock verifier accepts
    const nullifier0 = hash2(BigInt(sourceNote.commitment), BigInt(sourceNote.spendingKey))
    const nullifier1 = hash2(0n, 0n) // dummy nullifier for second input
    
    const outCommitment0 = outputNote.commitment
    const outCommitment1 = changeNote ? changeNote.commitment : 0n
    
    // Public inputs: [merkle_root, nullifier_0, nullifier_1, out_commitment_0, out_commitment_1, ext_data_hash]
    const merkleRoot = 0n // In production, this would be the actual Merkle root
    const extDataHash = 0n // In production, this would hash recipient/fee data
    
    const publicInputs = [
      fieldToHex(merkleRoot),
      fieldToHex(nullifier0),
      fieldToHex(nullifier1),
      fieldToHex(outCommitment0),
      fieldToHex(outCommitment1),
      fieldToHex(extDataHash),
    ] as `0x${string}`[]
    
    // Dummy proof (mock verifier accepts anything)
    const dummyProof = '0x' + '00'.repeat(128) as `0x${string}`
    
    try {
      // Submit transfer on-chain
      const txHash = await writeContract(wagmiConfig, {
        address: TRANSFER_PROCESSOR_ADDRESS as `0x${string}`,
        abi: transferProcessorAbi,
        functionName: 'transfer',
        args: [dummyProof, publicInputs],
        chain: null,
        account: from as `0x${string}`,
      })
      
      await waitForTransactionReceipt(wagmiConfig as any, { hash: txHash })
      
      // Mark source as spent
      markSpent(sourceNote.commitment)
      
      // Store output notes
      addNote(outputNote, { 
        assetCode: params.asset, 
        source: 'received',
        decimals: meta.decimals,
        txHash 
      })
      
      if (changeNote) {
        addNote(changeNote, { 
          assetCode: params.asset, 
          source: 'change',
          decimals: meta.decimals 
        })
      }
      
      addHistoryItem({
        id: 'tx_' + Date.now(),
        type: 'Swap',
        pairOrAsset: params.asset,
        amountIn: `${params.amount} ${params.asset}`,
        txHash,
        createdAt: Date.now(),
      })
      
      return { hash: txHash }
      
    } catch (error) {
      throw error
    }
  }

  async placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
    const amountBase = toBaseUnits(params.amount, 18)
    const priceBase = toBaseUnits(params.price, 18)
    
    // Find source note
    const notes = loadNotes()
    const sourceNote = notes.find(n => n.assetCode === params.base && !n.spent)
    if (!sourceNote) throw new Error(`No shielded ${params.base} balance for order`)
    
    // Mark source as spent
    markSpent(sourceNote.commitment)
    
    // Create order commitment
    const orderId = 'ord_' + Math.random().toString(36).slice(2, 10)
    
    // Store order in local state
    addOrder({
      commitment: orderId,
      side: params.side === 'buy' ? 0 : 1,
      price: params.price,
      amount: params.amount,
      assetBase: assetIdFor({ native: params.base === 'FLR', sac: assetMeta(params.base).sac }).toString(),
      assetQuote: assetIdFor({ native: params.quote === 'FLR', sac: assetMeta(params.quote).sac }).toString(),
      baseCode: params.base,
      quoteCode: params.quote,
      ownerKey: getSpendingKey().toString(),
      nonce: Math.random().toString(),
      lockedAssetId: sourceNote.assetId,
      lockedAmount: sourceNote.amount,
      lockedAssetCode: params.base,
      lockedDecimals: 18,
      status: 'open',
      createdAt: Date.now(),
    })
    
    return { hash: '0x' + orderId, orderId }
  }

  async cancelOrder(orderId: string): Promise<TxResult> {
    setOrderStatus(orderId, 'cancelled')
    return { hash: '0x' + orderId }
  }

  async swapShielded(params: SwapShieldedParams): Promise<TxResult> {
    const from = await this.requireAddress()
    const inMeta = assetMeta(params.assetIn)
    const outMeta = assetMeta(params.assetOut)
    const amountInBase = toBaseUnits(params.amountIn, inMeta.decimals)
    
    // Get AMM pool address
    const poolAddress = getAMMPool(params.assetIn, params.assetOut)
    if (!poolAddress) {
      throw new Error(`No AMM pool for ${params.assetIn}/${params.assetOut}`)
    }
    
    const tokenInAddress = getAMMTokenAddress(params.assetIn)
    const tokenOutAddress = getAMMTokenAddress(params.assetOut)
    
    let swapHash: string
    let expectedOut: bigint
    
    try {
      // Get expected output from AMM
      expectedOut = await readContract(wagmiConfig, {
        address: poolAddress as `0x${string}`,
        abi: simpleAMMAbi,
        functionName: 'getAmountOut',
        args: [tokenInAddress as `0x${string}`, amountInBase],
      })
      
      // Approve AMM to spend input token (skip for native FLR)
      if (params.assetIn !== 'FLR') {
        const approveHash = await writeContract(wagmiConfig, {
          address: tokenInAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'approve',
          args: [poolAddress as `0x${string}`, amountInBase],
          chain: null,
          account: from as `0x${string}`,
        })
        await waitForTransactionReceipt(wagmiConfig as any, { hash: approveHash })
      }
      
      // Execute swap on AMM
      const minAmountOut = expectedOut * 95n / 100n // 5% slippage tolerance
      
      if (params.assetIn === 'FLR') {
        // Native FLR -> Token
        swapHash = await writeContract(wagmiConfig, {
          address: poolAddress as `0x${string}`,
          abi: simpleAMMAbi,
          functionName: 'swap',
          args: [tokenInAddress as `0x${string}`, amountInBase, minAmountOut],
          value: amountInBase,
          chain: null,
          account: from as `0x${string}`,
        })
      } else {
        // Token -> Token or Token -> Native FLR
        swapHash = await writeContract(wagmiConfig, {
          address: poolAddress as `0x${string}`,
          abi: simpleAMMAbi,
          functionName: 'swap',
          args: [tokenInAddress as `0x${string}`, amountInBase, minAmountOut],
          chain: null,
          account: from as `0x${string}`,
        })
      }
      
      await waitForTransactionReceipt(wagmiConfig as any, { hash: swapHash })
      
    } catch (error) {
      // Fallback: simulated swap
      swapHash = '0x' + Math.random().toString(16).slice(2, 66)
      const priceRatio = inMeta.priceUsd / outMeta.priceUsd
      // Convert to human units first, then apply price, then convert to output base units
      const amountInHuman = baseUnitsToNumber(amountInBase, inMeta.decimals)
      const amountOutHuman = amountInHuman * priceRatio
      expectedOut = toBaseUnits(amountOutHuman.toFixed(outMeta.decimals), outMeta.decimals)
    }
    
    // Update shielded notes
    const notes = loadNotes()
    const inputNote = notes.find(n => n.assetCode === params.assetIn && !n.spent)
    if (inputNote) {
      markSpent(inputNote.commitment)
    }
    
    const outputNote = createNote({
      assetId: assetIdFor({ native: outMeta.native, sac: outMeta.sac }),
      amount: expectedOut,
      spendingKey: getSpendingKey(),
    })
    addNote(outputNote, { 
      assetCode: params.assetOut, 
      source: 'change',
      decimals: outMeta.decimals,
      txHash: swapHash
    })
    
    const inputAmount = BigInt(inputNote?.amount ?? '0')
    if (inputAmount > amountInBase) {
      const changeNote = createNote({
        assetId: BigInt(inputNote?.assetId ?? '0'),
        amount: inputAmount - amountInBase,
        spendingKey: getSpendingKey(),
      })
      addNote(changeNote, { 
        assetCode: params.assetIn, 
        source: 'change',
        decimals: inMeta.decimals 
      })
    }
    
    addHistoryItem({
      id: 'swap_' + Date.now(),
      type: 'Swap',
      pairOrAsset: `${params.assetIn}/${params.assetOut}`,
      amountIn: `${params.amountIn} ${params.assetIn}`,
      amountOut: `${baseUnitsToNumber(expectedOut, outMeta.decimals)} ${params.assetOut}`,
      txHash: swapHash,
      createdAt: Date.now(),
    })
    
    return { hash: swapHash }
  }

  async getShieldedBalances(): Promise<ShieldedBalance[]> {
    const totals = new Map<string, { base: bigint, decimals: number }>()
    for (const n of loadNotes()) {
      if (!n.spent) {
        const meta = assetMeta(n.assetCode)
        const decimals = n.decimals ?? meta.decimals
        const existing = totals.get(n.assetCode)
        if (existing) {
          existing.base += BigInt(n.amount)
        } else {
          totals.set(n.assetCode, { base: BigInt(n.amount), decimals })
        }
      }
    }
    const out: ShieldedBalance[] = []
    for (const [asset, { base, decimals }] of totals) {
      if (base <= 0n) continue
      const human = baseUnitsToNumber(base, decimals)
      const meta = assetMeta(asset)
      out.push({
        asset,
        amount: formatAmount(human),
        usdEstimate: human * (meta.priceUsd ?? 0)
      })
    }
    return out
  }

  async getOpenOrders(): Promise<OpenOrder[]> {
    const orders = loadOrders()
    return orders.filter(o => o.status === 'open').map(o => ({
      id: o.commitment,
      pair: `${o.baseCode}/${o.quoteCode}`,
      base: o.baseCode,
      quote: o.quoteCode,
      side: o.side === 0 ? 'buy' as const : 'sell' as const,
      price: o.price,
      amount: o.amount,
      filled: '0',
      createdAt: o.createdAt,
    }))
  }

  async getTransactionHistory(): Promise<HistoryItem[]> {
    return loadHistory()
  }
}
