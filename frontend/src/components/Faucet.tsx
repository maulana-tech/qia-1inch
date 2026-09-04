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

const FAUCET_TOKENS = CURATED_TOKENS.filter((t) => t.faucet)
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
      setMsg((m) => ({ ...m, [code]: `Pindahkan dompet ke ${CHAIN_NAME} dulu.` }))
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
            {DRIP.toLocaleString()} {code} dicetak ·{' '}
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
      const errMsg = e instanceof Error ? e.message : 'Pencetakan gagal.'
      if (errMsg.includes('contract') || errMsg.includes('deploy') || errMsg.includes('code')) {
        setMsg((m) => ({ ...m, [code]: 'Kontrak tokennya belum ada. Jalankan script/Deploy.s.sol dulu.' }))
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
          caption={`Cetak token mock ke dompetmu untuk mencoba swap dan tabungan di ${CHAIN_NAME}. Ini token testnet terbuka — bukan aset sungguhan.`}
        />

        <Card>
          <CardHeader>
            <CardTitle>Token uji</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!connected && (
              <p className="rounded-xl border border-ink-700 bg-ink-900/50 px-3.5 py-3 text-center text-sm text-zinc-500">
                Hubungkan dompetmu untuk mencetak.
              </p>
            )}

            {connected && !onTargetChain && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-3">
                <p className="mb-2 text-xs text-yellow-300">
                  Dompetmu ada di chain {chainId}. Pindah ke {CHAIN_NAME} (chain {ACTIVE_CHAIN_ID})
                  untuk mencetak token.
                </p>
                <Button size="sm" variant="outline" onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}>
                  Pindah ke {CHAIN_NAME}
                </Button>
              </div>
            )}

            {connected && !MOCK_TOKENS_DEPLOYED && !USE_MOCK && (
              <p className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3.5 py-3 text-xs text-yellow-300">
                Alamat token mock belum diisi. Deploy dulu:
                <span className="mt-1 block font-mono">
                  cd contracts &amp;&amp; forge script script/Deploy.s.sol --broadcast
                </span>
                lalu tempel alamatnya ke <span className="font-mono">VITE_USDC_ADDRESS</span> dan
                seterusnya di <span className="font-mono">frontend/.env.local</span>.
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
                          [t.code]: `Mode mock: ${DRIP.toLocaleString()} ${t.code} ditambahkan ke saldo.`,
                        }))
                        return
                      }
                      if (!t.sac) {
                        setMsg((m) => ({ ...m, [t.code]: 'Alamat kontraknya belum ada.' }))
                        return
                      }
                      void mint(t.code, t.sac)
                    }}
                  >
                    {busy === t.code ? 'Mencetak…' : `Cetak ${DRIP.toLocaleString()}`}
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
