// @ts-nocheck
import { sendTransaction, waitForTransactionReceipt, getAccount, writeContract, readContract } from '@wagmi/core'
// @ts-nocheck
import { Iqia, type EvmOperation, type ProofData, type BalanceNote, createNote, fieldToHex, hash2, hash4 } from '@iqia/sdk'
// @ts-nocheck
import { wagmiConfig } from './wagmi'
import * as desk from './desk'
// @ts-nocheck
import { POOL_CONTRACT_ID, TRANSFER_PROCESSOR_ADDRESS } from './config'
// @ts-nocheck
import { getSpendingKey, addNote, loadNotes, markSpent, addOrder, loadOrders, setOrderStatus, loadHistory, addHistoryItem } from './note-store'

// TransferProcessor ABI
const transferProcessorAbi = parseAbi([
  'function transfer(bytes calldata proof, bytes32[6] calldata publicInputs) external',
])




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
  IqiaSdk,
  HistoryItem,
} from './iqia-sdk'
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

export class RealIqiaSdk implements IqiaSdk {
  private sdk: Iqia | null = null;

  private getSdk(): Iqia {
    if (!this.sdk) {
      this.sdk = new Iqia({
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
    const isNative = params.native ?? assetMeta(params.asset).native ?? false
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
      assetBase: assetIdFor({ native: assetMeta(params.base).native, sac: assetMeta(params.base).sac }).toString(),
      assetQuote: assetIdFor({ native: assetMeta(params.quote).native, sac: assetMeta(params.quote).sac }).toString(),
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

  /**
   * Swap instan lewat meja Aqua.
   *
   * Dompet pengguna berdagang langsung ke router SwapVM; likuiditasnya diambil
   * dari dompet market maker saat transaksi berjalan, dan tidak pernah terkunci
   * di kontrak mana pun.
   *
   * Tidak ada kontrak perantara di sisi pengguna. Flag
   * `useTransferFromAndAquaPush` membuat SwapVM sendiri yang menarik tokenIn dan
   * mendorongnya ke Aqua, jadi pengguna cukup memberi izin seperti di DEX biasa.
   *
   * Ambang slippage ditegakkan SwapVM lewat threshold di taker data, sehingga
   * transaksi batal kalau harganya bergeser — bukan diperiksa setelah dana
   * berpindah.
   */
  async swapShielded(params: SwapShieldedParams): Promise<TxResult> {
    const account = (await this.requireAddress()) as `0x${string}`
    const inMeta = assetMeta(params.assetIn)
    const outMeta = assetMeta(params.assetOut)

    const tokenIn = inMeta.sac
    const tokenOut = outMeta.sac
    if (!tokenIn || !tokenOut) {
      throw new Error('Meja Aqua hanya melayani token ERC20; token native belum didukung.')
    }

    const amountInBase = toBaseUnits(params.amountIn, inMeta.decimals)
    const minOutBase = params.amountOutMin
      ? toBaseUnits(params.amountOutMin, outMeta.decimals)
      : 0n

    const { hash, amountOut } = await desk.swap(account, tokenIn, tokenOut, amountInBase, minOutBase)

    addHistoryItem({
      id: 'swap_' + Date.now(),
      type: 'Swap',
      pairOrAsset: `${params.assetIn} → ${params.assetOut}`,
      amountIn: `${formatAmount(baseUnitsToNumber(amountInBase, inMeta.decimals))} ${params.assetIn}`,
      amountOut: `${formatAmount(baseUnitsToNumber(amountOut, outMeta.decimals))} ${params.assetOut}`,
      txHash: hash,
      createdAt: Date.now(),
    })

    return { hash }
  }

  async swapShielded(_params: SwapShieldedParams): Promise<TxResult> {
    throw new Error(
      'Swap belum tersambung: jalur AMM lama sudah dibuang, perakit program SwapVM di sisi TypeScript belum ada.',
    )
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
