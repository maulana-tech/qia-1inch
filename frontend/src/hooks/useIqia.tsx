import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { deriveOwnerKey, deriveViewingKey } from '@iqia/sdk'
import { createIqiaSdk } from '../lib/iqia-sdk'
import type { OpenOrder, ShieldedBalance, IqiaSdk, HistoryItem } from '../lib/iqia-sdk'
import { USE_MOCK } from '../lib/config'
import {
  clearActiveIdentity,
  getSpendingKey,
  hasSpendingKey,
  randomSpendingKey,
  setActiveAddress,
  setSpendingKey,
} from '../lib/note-store'
import { resolveShieldedIdentity } from '../lib/shielded-identity'
import { deriveEncKeypair, encodeReceiveCode } from '../lib/note-crypto'
import { useWallet } from './useWallet'

interface IqiaContextValue {
  sdk: IqiaSdk
  balances: ShieldedBalance[]
  orders: OpenOrder[]
  history: HistoryItem[]
  loadingBalances: boolean
  loadingOrders: boolean
  loadingHistory: boolean
  /** The wallet's shareable Receive code (owner key + encryption key), or null until derived. */
  receiveCode: string | null
  /** True once the shielded spending key is ready (deposits/withdraws/sends can run). */
  identityReady: boolean
  refreshBalances: () => Promise<void>
  refreshOrders: () => Promise<void>
  refreshHistory: () => Promise<void>
}

const IqiaContext = createContext<IqiaContextValue | null>(null)

/**
 * Provides the app-wide Iqia SDK client plus cached shielded balances and open orders.
 * The shielded identity (spending + viewing keys) is derived from the connected Flare
 * wallet, and this is the only place that constructs the SDK, drives that derivation, and
 * runs the client indexer that rebuilds the Merkle tree and discovers incoming notes.
 */
export function IqiaProvider({ children }: { children: ReactNode }) {
  const sdkRef = useRef<IqiaSdk>(createIqiaSdk())
  const sdk = sdkRef.current
  const { address, status } = useWallet()

  const [balances, setBalances] = useState<ShieldedBalance[]>([])
  const [orders, setOrders] = useState<OpenOrder[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loadingBalances, setLoadingBalances] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [receiveCode, setReceiveCode] = useState<string | null>(null)
  const [identityReady, setIdentityReady] = useState(false)

  const refreshBalances = useCallback(async () => {
    setLoadingBalances(true)
    try {
      setBalances(await sdk.getShieldedBalances())
    } finally {
      setLoadingBalances(false)
    }
  }, [sdk])

  const refreshOrders = useCallback(async () => {
    setLoadingOrders(true)
    try {
      setOrders(await sdk.getOpenOrders())
    } finally {
      setLoadingOrders(false)
    }
  }, [sdk])

  const refreshHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      setHistory(await sdk.getTransactionHistory())
    } finally {
      setLoadingHistory(false)
    }
  }, [sdk])

  useEffect(() => {
    void refreshOrders()
    void refreshHistory()
  }, [refreshOrders, refreshHistory])

  // Bind the shielded identity to the connected wallet: derive keys, expose the receive
  // code, index the pool (rebuild the tree + discover notes), and load the balance. Clear
  // everything on disconnect.
  useEffect(() => {
    let cancelled = false

    function applyIdentity(key: bigint) {
      const ownerKey = deriveOwnerKey(key)
      const enc = deriveEncKeypair(deriveViewingKey(key))
      setReceiveCode(encodeReceiveCode(ownerKey, enc.pub))
    }

    async function sync() {
      if (USE_MOCK) {
        setActiveAddress('mock')
        if (!hasSpendingKey()) setSpendingKey(randomSpendingKey())
        if (cancelled) return
        applyIdentity(getSpendingKey())
        setIdentityReady(true)
        await refreshBalances()
        await refreshHistory()
        return
      }
 
      if (status !== 'connected' || !address) {
        clearActiveIdentity()
        setIdentityReady(false)
        setReceiveCode(null)
        setBalances([])
        setHistory([])
        setLoadingBalances(false)
        setLoadingHistory(false)
        return
      }
 
      setIdentityReady(false)
      try {
        const { key } = await resolveShieldedIdentity(address)
        if (cancelled) return
        applyIdentity(key)
        setIdentityReady(true)
        // Start the indexer (hydrates from cache), then sync from chain to rebuild the tree
        // and discover deposits/received notes/spends, then load the balance.
        await refreshBalances()
        await refreshOrders()
        await refreshHistory()
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to derive the shielded identity', err)
          setIdentityReady(false)
        }
      }
    }
 
    void sync()
    return () => {
      cancelled = true
    }
  }, [address, status, refreshBalances, refreshHistory])
 
  // Poll the chain while connected, so deposits/payments arrive without a manual refresh.
  useEffect(() => {
    if (USE_MOCK || !identityReady) return
    const id = setInterval(() => {
      void refreshBalances()
      void refreshOrders()
      void refreshHistory()
    }, 15_000)
    return () => clearInterval(id)
  }, [identityReady, address, refreshBalances, refreshOrders, refreshHistory])
 
  const value = useMemo<IqiaContextValue>(
    () => ({
      sdk,
      balances,
      orders,
      history,
      loadingBalances,
      loadingOrders,
      loadingHistory,
      receiveCode,
      identityReady,
      refreshBalances,
      refreshOrders,
      refreshHistory,
    }),
    [
      sdk,
      balances,
      orders,
      history,
      loadingBalances,
      loadingOrders,
      loadingHistory,
      receiveCode,
      identityReady,
      refreshBalances,
      refreshOrders,
      refreshHistory,
    ],
  )

  return <IqiaContext.Provider value={value}>{children}</IqiaContext.Provider>
}

export function useIqia(): IqiaContextValue {
  const ctx = useContext(IqiaContext)
  if (!ctx) throw new Error('useIqia must be used within a IqiaProvider')
  return ctx
}
