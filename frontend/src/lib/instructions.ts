/**
 * Instruksi SwapVM, diterjemahkan jadi kalimat manusia.
 *
 * # Kenapa terjemahan, bukan penyembunyian
 *
 * Godaan gampangnya adalah menutupi mesin ini dari halaman konsumen dan cuma
 * menampilkan angka hasilnya. Itu keliru dua kali.
 *
 * Pertama, ia membantah klaim aplikasinya sendiri: halaman posisi menulis bahwa
 * program siapa pun bisa dibongkar tanpa izin. Kalau halaman yang paling sering
 * dibuka justru menutupinya, klaim itu jadi omong kosong di tempat yang paling
 * terlihat.
 *
 * Kedua — dan ini yang lebih penting — mekanismenya JUSTRU alasan memilih Aqua.
 * "Ada tabungan" itu ada di mana-mana; "uangmu tidak pernah keluar dari
 * dompetmu" tidak. Menyembunyikan mesin berarti menyembunyikan satu-satunya
 * alasan orang harus peduli.
 *
 * Jadi tiap halaman menampilkan mesin yang sama, dari sudut pandang berbeda:
 * Savings sebagai JAMINAN (berkas ini), Open position sebagai KENDALI, dan
 * halaman posisi sebagai BUKTI — bytecode apa adanya, tanpa terjemahan.
 */

/** Kalimat teknis: apa yang instruksi ini lakukan. Dipakai halaman posisi. */
export const WHAT_IT_DOES: Record<string, string> = {
  SOLVENCY_GUARD: "prices against the maker's real wallet backing",
  EXCLUSIVE_FILL: 'only one named address may fill this order',
  FLAT_FEE_IN: 'takes a flat fee from the input, before the curve',
  AQUA_PROTOCOL_FEE_IN: 'routes a share of the input to a third address',
  XYC_SWAP: 'constant-product curve, x·y=k',
  XYC_CONCENTRATE: 'concentrates liquidity into a price band',
  DECAY: 'lets the quote catch up gradually after a price move',
  SALT: 'makes the strategy hash unique — no behaviour',
  DEADLINE: 'refuses to execute after a timestamp',
  JUMP: 'control flow',
}

/**
 * Kalimat jaminan: kenapa instruksi ini ada untukmu. Dipakai halaman Savings.
 *
 * Kalimat yang sama, sudut pandang berbeda. `SOLVENCY_GUARD` di atas berbunyi
 * "prices against the maker's real wallet backing" — benar, dan tidak menjawab
 * pertanyaan yang sebenarnya ditanyakan penabung, yaitu "kalau uangku kubelanjakan,
 * apa yang terjadi".
 */
export const WHY_IT_PROTECTS_YOU: Record<string, string> = {
  SOLVENCY_GUARD:
    'Watches your real wallet. Spend from it and swappers pay more, instead of your remaining balance being sold cheaply.',
  FLAT_FEE_IN: 'Takes a cut of every swap that passes through, and it goes to you.',
  AQUA_PROTOCOL_FEE_IN: 'A smaller cut for this app, taken in the same swap. Nothing is billed separately.',
  XYC_SWAP: 'Sets your price from the ratio of your two balances. Bigger trades get a worse rate.',
  XYC_CONCENTRATE:
    'Concentrates your liquidity into a price band, so the same balance earns more inside it.',
  DECAY: 'After a price move your quote catches up gradually, so arbitrageurs get less of the gap.',
  EXCLUSIVE_FILL: 'Only the one address you named can trade against this position.',
  SALT: 'Just an identifier. It changes nothing about how your position behaves.',
  DEADLINE: 'Stops working after a set time.',
}
