import { Act } from '../components/Act'
import { Swap } from '../components/Swap'
import { USE_MOCK } from '../lib/config'
import { matchingEnabled } from '../lib/matcher-client'

/** Catatan kejujuran — "i" kecil di samping judul yang membuka penjelasan saat
 *  disentuh. Muncul saat belum ada operator pencocokan yang berjalan. */
function OperatorInfo() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="Tentang limit order"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-spectral/40 font-mono text-[11px] leading-none text-spectral/70 transition hover:border-spectral hover:text-spectral"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-72 rounded-none border border-spectral/12 bg-ink-900/95 px-4 py-3 text-xs leading-relaxed text-zinc-300 opacity-0 shadow-xl backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="font-mono uppercase tracking-[0.14em] text-spectral/80">Limit order</span> — swap instan sudah
        berjalan lewat meja Aqua. Limit order belum tersambung: penyelesaiannya menuntut sirkuit yang membatasi nilai
        commitment keluaran, dan sirkuit itu belum ada.
      </span>
    </span>
  )
}

export function SwapPage() {
  const showOperator = !USE_MOCK && !matchingEnabled()
  return (
    <Act
      no="Act 03"
      id="act-book"
      title="Meja likuiditas"
      standfirst="Berdagang langsung ke dompet market maker lewat 1inch Aqua. Modalnya tidak pernah terkunci di kontrak mana pun, dan harganya dihitung program bytecode di dalam SwapVM."
      coords={['1inch Aqua', 'SwapVM']}
      titleAside={showOperator ? <OperatorInfo /> : undefined}
      maxWidthClassName="max-w-6xl"
    >
      <Swap embedded />
    </Act>
  )
}

export default SwapPage
