import { OPCODE } from './opcodes.js'
import type { Hex } from './hex.js'

/**
 * Membongkar program SwapVM kembali jadi daftar instruksi.
 *
 * # Kenapa ini ada
 *
 * Registry Aqua memancarkan seluruh `Order` di event `Shipped`, termasuk
 * bytecode programnya. Artinya strategi siapa pun bisa dibaca tanpa izin, tanpa
 * API, dan tanpa bertanya kepada pemiliknya. Yang menghalangi cuma satu: byte
 * mentah tidak terbaca manusia.
 *
 * Ini pembalik `program()`. Formatnya sesederhana yang dirakit sisi encoder —
 * `[opcode 1 byte][panjang 1 byte][argumen n byte]`, diulang sampai habis.
 *
 * # Yang TIDAK dilakukan
 *
 * Tidak mengikuti lompatan, tidak masuk ke sub-program `Extruction`, dan tidak
 * menafsirkan argumen. Ia membacakan urutannya apa adanya. Menafsirkan argumen
 * butuh tabel bentuk per opcode yang akan basi diam-diam begitu SwapVM bergerak;
 * urutan instruksi sudah cukup untuk menjawab pertanyaan yang benar-benar
 * ditanyakan orang — kurva apa, fee berapa, ada gerbang atau tidak.
 */

/** Nomor → nama, dibalik dari tabel yang sama yang dipakai encoder. */
const NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(OPCODE).map(([name, num]) => [num, name]),
)

export interface Instruction {
  /** Posisi byte instruksi ini di dalam program. */
  offset: number
  opcode: number
  /** Nama dari tabel kita, atau null kalau nomornya tidak dikenali. */
  name: string | null
  /** Argumen mentah, tanpa opcode dan tanpa byte panjang. */
  args: Hex
}

export class DisassembleError extends Error {}

/**
 * @throws DisassembleError kalau byte-nya habis di tengah instruksi.
 *   Dilempar, bukan dipotong diam-diam: program yang terpotong berarti kita
 *   salah membaca formatnya, dan menampilkan separuh hasil sebagai kalau itu
 *   program utuh lebih menyesatkan daripada mengaku tidak bisa membacanya.
 */
export function disassemble(program: Hex): Instruction[] {
  const body = program.startsWith('0x') ? program.slice(2) : program
  if (body.length % 2 !== 0) throw new DisassembleError('panjang program bukan kelipatan byte')

  const out: Instruction[] = []
  let i = 0
  while (i < body.length) {
    if (i + 4 > body.length) {
      throw new DisassembleError(`byte habis di offset ${i / 2}: header instruksi tidak lengkap`)
    }
    const opcode = parseInt(body.slice(i, i + 2), 16)
    const len = parseInt(body.slice(i + 2, i + 4), 16)
    const argStart = i + 4
    const argEnd = argStart + len * 2
    if (argEnd > body.length) {
      throw new DisassembleError(
        `byte habis di offset ${i / 2}: opcode ${opcode} menuntut ${len} byte argumen`,
      )
    }
    out.push({
      offset: i / 2,
      opcode,
      name: NAMES[opcode] ?? null,
      args: `0x${body.slice(argStart, argEnd)}` as Hex,
    })
    i = argEnd
  }
  return out
}
