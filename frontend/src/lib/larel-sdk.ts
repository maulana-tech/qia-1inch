// MOCK — replace with @larel/sdk
//
// This module is the SINGLE seam between the Larel UI and the protocol SDK.
// Every component talks ONLY to the `LarelSdk` interface below, so swapping in
// the real `@larel/sdk` (which exposes the same method names — deposit, withdraw,
// transfer, placeOrder, cancelOrder, getShieldedBalances, getOpenOrders) is a
// one-file change: make `createLarelSdk()` return the real client instead of
// `MockLarelSdk`. No UI code imports anything else from the SDK layer.

import { formatAmount, parseAmount } from './format'
import { RealLarelSdk } from './real-sdk'

/**
 * A shielded asset's display code. The protocol is asset-agnostic — any ERC20
 * Contract (SAC) can be deposited — so this is an open string, not a fixed union. Well-
 * known codes (FLR, USDC, ETH, BTC, XRP, bETH, bUSDC) have curated metadata in
 * `lib/tokens.ts`; custom tokens carry their own descriptor (see {@link DepositParams}).
 */
export type AssetCode = string
export type OrderSide = 'buy' | 'sell'

export interface ShieldedBalance {
  asset: AssetCode
  /** Human-readable decimal amount, e.g. "1,240.5". */
  amount: string
  /** Mock USD estimate for the position. */
  usdEstimate: number
}

export interface OpenOrder {
  id: string
  /** Trading pair "BASE/QUOTE", e.g. "FLR/USDC". */
  pair: string
  base: AssetCode
  quote: AssetCode
  side: OrderSide
  /** Limit price, quote per base. */
  price: string
  /** Order size in base asset. */
  amount: string
  /** Amount already filled (partial fills). */
  filled: string
  createdAt: number
}

export interface TxResult {
  /** Mock Soroban transaction hash. */
  hash: string
}

export interface DepositParams {
  asset: AssetCode
  amount: string
  /** Explicit token descriptor for curated/custom assets. When omitted, FLR is assumed. */
  sac?: string
  decimals?: number
  native?: boolean
}

export interface WithdrawParams {
  asset: AssetCode
  amount: string
  /** Classic Flare recipient address (0x…). */
  recipient: string
  /** The exact note to withdraw (commitment hex), from the note picker. */
  commitment?: string
}

export interface TransferParams {
  /** Recipient's Larel owner key, shared out-of-band. */
  recipientKey: string
  asset: AssetCode
  amount: string
}

export interface PlaceOrderParams {
  base: AssetCode
  quote: AssetCode
  side: OrderSide
  price: string
  amount: string
}

export interface PlaceOrderResult extends TxResult {
  orderId: string
}

export interface SwapShieldedParams {
  assetIn: AssetCode
  assetOut: AssetCode
  amountIn: string
  amountOutMin: string
  path: string[]
  deadline?: string
}

export interface HistoryItem {
  id: string
  type: 'Swap' | 'Deposit' | 'Withdrawal' | 'Limit Order (Filled)' | 'Limit Order (Cancelled)'
  pairOrAsset: string
  amountIn?: string
  amountOut?: string
  txHash?: string
  createdAt: number
}

/**
 * The Larel client surface. The real `@larel/sdk` exposes these exact method
 * names; the UI is written against this interface only.
 */
export interface LarelSdk {
  deposit(params: DepositParams): Promise<TxResult>
  withdraw(params: WithdrawParams): Promise<TxResult>
  transfer(params: TransferParams): Promise<TxResult>
  placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult>
  cancelOrder(orderId: string): Promise<TxResult>
  swapShielded(params: SwapShieldedParams): Promise<TxResult>
  getShieldedBalances(): Promise<ShieldedBalance[]>
  getOpenOrders(): Promise<OpenOrder[]>
  getTransactionHistory(): Promise<HistoryItem[]>
}

// --- Mock implementation ----------------------------------------------------

const PRICES: Record<AssetCode, number> = { FLR: 0.03, USDC: 1, bETH: 3500, bUSDC: 1 }

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A base delay plus some jitter, so the UI feels like a real network. */
function networkDelay(base: number, spread: number): number {
  return base + Math.random() * spread
}

function randomHash(): string {
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 64; i += 1) out += hex[Math.floor(Math.random() * 16)]
  return out
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

class MockLarelSdk implements LarelSdk {
  private balances: Record<AssetCode, number> = { FLR: 1240.5, USDC: 3500, bETH: 0, bUSDC: 0 }

  private orders: OpenOrder[] = [
    {
      id: 'ord_seed01',
      pair: 'FLR/USDC',
      base: 'FLR',
      quote: 'USDC',
      side: 'buy',
      price: '0.38',
      amount: '2500',
      filled: '0',
      createdAt: Date.now() - 1000 * 60 * 42,
    },
    {
      id: 'ord_seed02',
      pair: 'FLR/USDC',
      base: 'FLR',
      quote: 'USDC',
      side: 'sell',
      price: '0.415',
      amount: '1800',
      filled: '600',
      createdAt: Date.now() - 1000 * 60 * 60 * 3,
    },
  ]

  async getShieldedBalances(): Promise<ShieldedBalance[]> {
    await delay(networkDelay(350, 250))
    return (Object.keys(this.balances) as AssetCode[])
      .filter((asset) => this.balances[asset] > 0)
      .map((asset) => ({
        asset,
        amount: formatAmount(this.balances[asset]),
        usdEstimate: round2(this.balances[asset] * (PRICES[asset] ?? 0)),
      }))
  }

  async getOpenOrders(): Promise<OpenOrder[]> {
    await delay(networkDelay(300, 250))
    return this.orders.map((order) => ({ ...order }))
  }

  async getTransactionHistory(): Promise<HistoryItem[]> {
    await delay(networkDelay(300, 250))
    return []
  }

  async deposit({ asset, amount }: DepositParams): Promise<TxResult> {
    await delay(networkDelay(600, 400))
    const value = parseAmount(amount)
    if (Number.isFinite(value) && value > 0) this.balances[asset] = (this.balances[asset] ?? 0) + value
    return { hash: randomHash() }
  }

  async withdraw({ asset, amount }: WithdrawParams): Promise<TxResult> {
    await delay(networkDelay(800, 500))
    const value = parseAmount(amount)
    if (Number.isFinite(value) && value > 0) {
      this.balances[asset] = Math.max(0, this.balances[asset] - value)
    }
    return { hash: randomHash() }
  }

  async transfer({ asset, amount }: TransferParams): Promise<TxResult> {
    await delay(networkDelay(700, 400))
    const value = parseAmount(amount)
    if (Number.isFinite(value) && value > 0) {
      this.balances[asset] = Math.max(0, this.balances[asset] - value)
    }
    return { hash: randomHash() }
  }

  async placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
    await delay(networkDelay(750, 500))
    const amount = parseAmount(params.amount)
    const price = parseAmount(params.price)
    // Lock funds: buy locks quote (amount * price), sell locks base.
    if (Number.isFinite(amount) && Number.isFinite(price)) {
      if (params.side === 'buy') {
        this.balances[params.quote] = Math.max(0, this.balances[params.quote] - amount * price)
      } else {
        this.balances[params.base] = Math.max(0, this.balances[params.base] - amount)
      }
    }
    const order: OpenOrder = {
      id: randomId('ord'),
      pair: `${params.base}/${params.quote}`,
      base: params.base,
      quote: params.quote,
      side: params.side,
      price: formatAmount(price),
      amount: formatAmount(amount),
      filled: '0',
      createdAt: Date.now(),
    }
    this.orders = [order, ...this.orders]
    return { hash: randomHash(), orderId: order.id }
  }

  async cancelOrder(orderId: string): Promise<TxResult> {
    await delay(networkDelay(550, 350))
    const order = this.orders.find((o) => o.id === orderId)
    if (order) {
      // Refund the still-locked, unfilled remainder of the order.
      const amount = parseAmount(order.amount)
      const price = parseAmount(order.price)
      const filled = parseAmount(order.filled)
      const remaining = Math.max(0, (Number.isFinite(amount) ? amount : 0) - (Number.isFinite(filled) ? filled : 0))
      if (order.side === 'buy') {
        this.balances[order.quote] += remaining * (Number.isFinite(price) ? price : 0)
      } else {
        this.balances[order.base] += remaining
      }
      this.orders = this.orders.filter((o) => o.id !== orderId)
    }
    return { hash: randomHash() }
  }

  async swapShielded({ assetIn, assetOut, amountIn, amountOutMin }: SwapShieldedParams): Promise<TxResult> {
    await delay(networkDelay(1000, 500))
    const valIn = parseAmount(amountIn)
    const valOut = parseAmount(amountOutMin)
    if (Number.isFinite(valIn) && valIn > 0 && Number.isFinite(valOut)) {
      this.balances[assetIn] = Math.max(0, (this.balances[assetIn] ?? 0) - valIn)
      this.balances[assetOut] = (this.balances[assetOut] ?? 0) + valOut
    }
    return { hash: randomHash() }
  }
}

let singleton: LarelSdk | null = null

/**
 * Returns the app-wide Larel client.
 *
 * By default this is the LIVE `RealLarelSdk`, wired to the deployed LarelPool on
 * Flare Coston2 (real deposit + portfolio; experimental withdraw). Set
 * `VITE_USE_MOCK=true` to fall back to the offline `MockLarelSdk` for UI dev with no
 * wallet / network. Nothing else in the UI changes between the two.
 */
export function createLarelSdk(): LarelSdk {
  if (!singleton) {
    const useMock = import.meta.env.VITE_USE_MOCK === 'true'
    singleton = useMock ? new MockLarelSdk() : new RealLarelSdk()
  }
  return singleton
}
