import { useState, type ReactNode } from 'react'
import { useWallet } from '../hooks/useWallet'
import { CURATED_TOKENS } from '../lib/tokens'
import { faucetMint } from '../lib/faucet'
import { truncateKey } from '../lib/format'
import { MOCK_TOKENS_DEPLOYED, USE_MOCK } from '../lib/config'
import { CoinBadge } from './BrandIcons'
import { Button } from './ui'
import { ConnectWallet } from './ConnectWallet'

import { useWalletClient, usePublicClient, useAccount, useSwitchChain } from 'wagmi'
import { flareTestnet } from 'wagmi/chains'

const FAUCET_TOKENS = CURATED_TOKENS.filter((t) => t.faucet)
const DRIP = 1000

/** Testnet faucet: mint mock tokens (USDC/ETH/BTC/XRP) to the connected wallet. */
export function Faucet() {
  const wallet = useWallet()
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, ReactNode>>({})
  const connected = wallet.status === 'connected'
  const onCoston2 = chainId === flareTestnet.id

  async function mint(code: string, sac: string, decimals: number) {
    if (!walletClient || !publicClient) {
      setMsg((m) => ({ ...m, [code]: 'Switch MetaMask to Flare Coston2 first.' }))
      return
    }
    setBusy(code)
    setMsg((m) => ({ ...m, [code]: '' }))
    try {
      const hash = await faucetMint(sac, BigInt(DRIP) * 10n ** BigInt(decimals), walletClient, publicClient)
      const explorerUrl = `https://coston2-explorer.flare.network/tx/${hash}`
      setMsg((m) => ({ ...m, [code]: <span>Minted {DRIP.toLocaleString()} {code} · <a href={explorerUrl} target="_blank" rel="noreferrer" className="text-spectral-soft hover:underline">{truncateKey(hash, 6, 6)}</a></span> }))
    } catch (e) {
      console.error(e)
      const errMsg = e instanceof Error ? e.message : 'Mint failed.'
      // Provide a more helpful error for common issues
      if (errMsg.includes('contract') || errMsg.includes('deploy') || errMsg.includes('code')) {
        setMsg((m) => ({ ...m, [code]: `Token contract not deployed yet. Run: forge script script/Deploy.s.sol` }))
      } else {
        setMsg((m) => ({ ...m, [code]: errMsg }))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[460px] px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <a href="/app" className="text-sm text-zinc-400 transition hover:text-zinc-200">
          ← Wallet
        </a>
        <ConnectWallet />
      </header>

      <section className="rounded-none border border-ink-700 bg-ink-850/70 p-6 shadow-panel">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Testnet faucet</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Mint mock tokens to your connected wallet, then deposit them into the shielded pool. These
          are open-mint testnet tokens — not real assets.
        </p>

        {!connected && (
          <p className="mt-4 rounded-none border border-ink-700 bg-ink-900/50 px-3.5 py-3 text-center text-sm text-zinc-500">
            Connect your Flare wallet to mint.
          </p>
        )}

        {connected && !onCoston2 && (
          <div className="mt-4 rounded-none border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-3">
            <p className="text-xs text-yellow-300 mb-2">
              MetaMask is on chain {chainId}. Switch to Flare Coston2 (Chain 114) to mint tokens.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => switchChain({ chainId: flareTestnet.id })}
            >
              Switch to Coston2
            </Button>
          </div>
        )}

        {connected && !MOCK_TOKENS_DEPLOYED && !USE_MOCK && (
          <p className="mt-4 rounded-none border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-3 text-xs text-yellow-300">
            Mock ERC20 token addresses are not configured. Deploy them with
            <span className="mt-1 block font-mono">cd contracts && forge script script/Deploy.s.sol --broadcast</span>
            then paste the addresses into <span className="font-mono">config.ts</span> or set <span className="font-mono">VITE_USDC_SAC</span> etc. env vars.
          </p>
        )}

        <div className="mt-4 space-y-2">
          {FAUCET_TOKENS.map((t) => (
            <div
              key={t.code}
              className="flex items-center gap-3 rounded-none border border-ink-800 bg-ink-900/40 p-3"
            >
              <CoinBadge name={t.icon} size="lg" />
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight text-zinc-100">{t.code}</div>
                <div className="truncate text-xs text-zinc-400">{t.name}</div>
              </div>
              <Button
                size="sm"
                className="ml-auto"
                disabled={!connected || busy !== null || (!t.sac && !USE_MOCK)}
                loading={busy === t.code}
                onClick={() => {
                  if (USE_MOCK) {
                    setMsg((m) => ({ ...m, [t.code]: `Mock mode: ${DRIP.toLocaleString()} ${t.code} added to balance.` }))
                    return
                  }
                  if (!t.sac) {
                    setMsg((m) => ({ ...m, [t.code]: 'No contract address. Deploy mock tokens first.' }))
                    return
                  }
                  void mint(t.code, t.sac, t.decimals)
                }}
              >
                {busy === t.code ? 'Minting…' : `Mint ${DRIP.toLocaleString()}`}
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1">
          {FAUCET_TOKENS.map((t) =>
            msg[t.code] ? (
              <p key={t.code} className="text-xs text-zinc-500">
                <span className="font-medium text-zinc-400">{t.code}</span> · {msg[t.code]}
              </p>
            ) : null,
          )}
        </div>
      </section>
    </div>
  )
}
