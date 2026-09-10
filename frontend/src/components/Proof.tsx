import { useIsDark } from '../hooks/useTheme'
import { AQUA_ADDRESS, EXPLORER_URL, SWAP_VM_ROUTER_ADDRESS } from '../lib/config'

/**
 * Bukti, bukan klaim.
 *
 * # Kenapa bagian ini ada
 *
 * Sisa halaman ini menjelaskan apa yang dilakukan aplikasinya. Yang tidak
 * dijelaskannya: bahwa semua itu sudah berjalan, di kontrak resmi, dan bisa
 * diperiksa tanpa mempercayai satu kalimat pun di halaman ini.
 *
 * Juri yang membuka landing page punya satu pertanyaan yang tidak dijawab
 * paragraf mana pun — "ini beneran jalan atau cuma dideskripsikan?" Empat tautan
 * di bawah menjawabnya lebih cepat daripada kalimat mana pun.
 *
 * # Kenapa angkanya tidak diambil dari rantai
 *
 * Godaannya adalah menampilkan jumlah pasar dan efisiensi modal secara langsung.
 * Tapi landing page dimuat sebelum ada dompet, RPC publik bisa lambat atau
 * menjatuhkan jawaban diam-diam — sudah terbukti di halaman Markets — dan
 * halaman depan yang menampilkan "0 pasar" karena satu panggilan meleset lebih
 * merusak daripada tidak menampilkan angka sama sekali.
 *
 * Jadi yang ditulis di sini hanya yang TIDAK BISA basi: alamat kontrak, hash
 * transaksi, dan nomor opcode. Semuanya permanen, dan semuanya bisa diklik.
 */

const TX = '0x9fe91859a32705c4e0984f5e9e2f532207ee982ffd632d49807fc9973cda4d91'

export function Proof() {
  const dark = useIsDark()
  const label = dark ? 'rgba(255,255,255,0.38)' : 'rgba(25,25,25,0.38)'
  const body = dark ? 'rgba(255,255,255,0.62)' : 'rgba(25,25,25,0.62)'
  const strong = dark ? 'rgba(255,255,255,0.92)' : 'rgba(25,25,25,0.92)'
  const line = dark ? 'rgba(255,255,255,0.10)' : 'rgba(25,25,25,0.10)'

  const items = [
    {
      k: 'aqua registry',
      v: 'official 1inch',
      note: 'The same contract 1inch deploys on 16 chains, byte-identical to Base mainnet.',
      href: EXPLORER_URL ? `${EXPLORER_URL}/address/${AQUA_ADDRESS}` : undefined,
    },
    {
      k: 'our swapvm router',
      v: 'opcode 22 · 23',
      note: 'Stock SwapVM plus ExclusiveFill and SolvencyGuard. A redeployment, as the rules allow.',
      href: EXPLORER_URL ? `${EXPLORER_URL}/address/${SWAP_VM_ROUTER_ADDRESS}` : undefined,
    },
    {
      k: 'tokens moved',
      v: '250 USDC → WETH',
      note: 'A real swap through our position. ship() moves nothing; this is what moves tokens.',
      href: EXPLORER_URL ? `${EXPLORER_URL}/tx/${TX}` : undefined,
    },
    {
      k: 'one balance',
      v: '3 markets',
      note: 'The same WETH quotes in WETH/USDC, WETH/DAI and WETH/WBTC at once. A pool would split it.',
    },
  ]

  return (
    <section className="relative z-10 border-t" style={{ borderColor: line }}>
      <div className="mx-auto w-full max-w-[100rem] px-6 py-14 sm:px-10 lg:px-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: label }}>
          verifiable on chain
        </p>

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => {
            const inner = (
              <>
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.16em]"
                  style={{ color: label }}
                >
                  {it.k}
                </p>
                <p className="mt-1.5 font-mono text-lg tracking-tight" style={{ color: strong }}>
                  {it.v}
                </p>
                <p className="mt-2 max-w-[24rem] text-xs leading-relaxed" style={{ color: body }}>
                  {it.note}
                </p>
                {it.href && (
                  <span
                    className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.16em] underline underline-offset-4"
                    style={{ color: label }}
                  >
                    view ↗
                  </span>
                )}
              </>
            )
            return it.href ? (
              <a
                key={it.k}
                href={it.href}
                target="_blank"
                rel="noreferrer"
                className="block transition-opacity hover:opacity-80"
              >
                {inner}
              </a>
            ) : (
              <div key={it.k}>{inner}</div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default Proof
