import { useState, type ReactNode } from 'react'
import { useWallet } from '../hooks/useWallet'
import { CURATED_TOKENS } from '../lib/tokens'
import { faucetMint } from '../lib/faucet'
import { truncateKey } from '../lib/format'
import { CHAIN_NAME, MOCK_TOKENS_DEPLOYED, USE_MOCK, explorerTxUrl } from '../lib/config'
import { ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { tokenDecimals } from '../lib/payments'
import { CoinBadge } from './BrandIcons'
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader } from './ui'

import { useWalletClient, usePublicClient, useAccount, useSwitchChain } from 'wagmi'

/**
 * Hanya token yang benar-benar ada di rantai ini.
 *
 * Registry-nya mendaftar empat token uji, tapi tiap deployment belum tentu
 * memasang semuanya — Sepolia cuma punya WETH dan USDC. Menampilkan tombol
 * cetak untuk token yang alamatnya kosong cuma menawarkan sesuatu yang pasti
 * gagal.
 */
const FAUCET_TOKENS = CURATED_TOKENS.filter((t) => t.faucet && (t.sac || USE_MOCK))
const DRIP = 1000

/**
 * Faucet testnet: mencetak token mock ke dompet yang terhubung.
 *
 * Jaringan sasarannya dibaca dari `ACTIVE_CHAIN_ID`, bukan dipatok ke satu
 * rantai. Sebelumnya dipatok ke Base Sepolia, jadi di anvil banner "pindah
 * jaringan" tidak pernah hilang dan token tidak bisa dicetak sama sekali —
 * padahal anvil justru jalur demo lokalnya.
 */
export function Faucet() {
  const wallet = useWallet()
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, ReactNode>>({})
  const connected = wallet.status === 'connected'
  const onTargetChain = chainId === ACTIVE_CHAIN_ID

  async function mint(code: string, token: string) {
    if (!walletClient || !publicClient) {
      setMsg((m) => ({ ...m, [code]: `Switch your wallet to ${CHAIN_NAME} first.` }))
      return
    }
    setBusy(code)
    setMsg((m) => ({ ...m, [code]: '' }))
    try {
      // Desimalnya dari kontrak, bukan dari registry: di sana USDC ditulis 7
      // sedangkan mock yang ter-deploy 6, jadi angkanya akan sepuluh kali lipat.
      const decimals = await tokenDecimals(token as `0x${string}`)
      const hash = await faucetMint(token, BigInt(DRIP) * 10n ** BigInt(decimals), walletClient, publicClient)
      setMsg((m) => ({
        ...m,
        [code]: (
          <span>
            {DRIP.toLocaleString()} {code} minted ·{' '}
            <a
              href={explorerTxUrl(hash)}
              target="_blank"
              rel="noreferrer"
              className="text-spectral-soft hover:underline"
            >
              {truncateKey(hash, 6, 6)}
            </a>
          </span>
        ),
      }))
    } catch (e) {
      console.error(e)
      const errMsg = e instanceof Error ? e.message : 'Minting failed.'
      if (errMsg.includes('contract') || errMsg.includes('deploy') || errMsg.includes('code')) {
        setMsg((m) => ({ ...m, [code]: 'The token contract is not deployed yet. Run script/Deploy.s.sol first.' }))
      } else {
        setMsg((m) => ({ ...m, [code]: errMsg }))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
      <section className="space-y-5">
        <PageHeader
          title="Faucet"
          caption={`Mint mock tokens to your wallet to try swaps and savings on ${CHAIN_NAME}. These are open testnet tokens — not real assets.`}
        />

        <Card>
          <CardHeader>
            <CardTitle>Test tokens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!connected && (
              <p className="rounded-xl border border-ink-700 bg-ink-900/50 px-3.5 py-3 text-center text-sm text-zinc-500">
                Connect your wallet to mint.
              </p>
            )}

            {connected && !onTargetChain && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-3">
                <p className="mb-2 text-xs text-yellow-300">
                  Your wallet is on chain {chainId}. Switch to {CHAIN_NAME} (chain {ACTIVE_CHAIN_ID})
                  to mint tokens.
                </p>
                <Button size="sm" variant="outline" onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}>
                  Switch to {CHAIN_NAME}
                </Button>
              </div>
            )}

            {connected && !MOCK_TOKENS_DEPLOYED && !USE_MOCK && (
              <p className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-3 text-xs text-yellow-300">
                Mock token addresses are not set. Deploy them first:
                <span className="mt-1 block font-mono">
                  cd contracts &amp;&amp; forge script script/Deploy.s.sol --broadcast
                </span>
                then paste the addresses into <span className="font-mono">VITE_USDC_ADDRESS</span> and
                the rest in <span className="font-mono">frontend/.env.local</span>.
              </p>
            )}

            <div className="space-y-2">
              {FAUCET_TOKENS.map((t) => (
                <div
                  key={t.code}
                  className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-3"
                >
                  <CoinBadge name={t.icon} size="lg" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold tracking-tight text-zinc-100">{t.code}</div>
                    <div className="truncate text-xs text-zinc-400">{t.name}</div>
                  </div>
                  <Button
                    size="sm"
                    className="ml-auto"
                    disabled={!connected || !onTargetChain || busy !== null || (!t.sac && !USE_MOCK)}
                    loading={busy === t.code}
                    onClick={() => {
                      if (USE_MOCK) {
                        setMsg((m) => ({
                          ...m,
                          [t.code]: `Mock mode: ${DRIP.toLocaleString()} ${t.code} added to your balance.`,
                        }))
                        return
                      }
                      if (!t.sac) {
                        setMsg((m) => ({ ...m, [t.code]: 'That contract address is not set.' }))
                        return
                      }
                      void mint(t.code, t.sac)
                    }}
                  >
                    {busy === t.code ? 'Minting…' : `Mint ${DRIP.toLocaleString()}`}
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              {FAUCET_TOKENS.map((t) =>
                msg[t.code] ? (
                  <p key={t.code} className="text-xs text-zinc-500">
                    <span className="font-medium text-zinc-400">{t.code}</span> · {msg[t.code]}
                  </p>
                ) : null,
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
