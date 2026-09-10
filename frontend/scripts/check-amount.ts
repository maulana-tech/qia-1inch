/**
 * Pemeriksaan jalur uang: mengurai jumlah dari kolom input.
 *
 * Dijalankan `pnpm test` di paket ini. Tanpa framework — `tsx` sudah ada di
 * workspace, dan satu berkas assert cukup untuk gagal keras kalau parsernya
 * bergeser.
 */
import assert from 'node:assert/strict'

import { parseAmountStrict as parse } from '../src/lib/amount'

// Desimal berlebih DIPANGKAS, tidak dibulatkan. `parseUnits` viem sendiri
// mengembalikan 2000000 untuk kasus ini — itu yang tidak boleh terjadi.
assert.equal(parse('1.9999999', 6), 1_999_999n, 'desimal berlebih harus dipangkas')
assert.equal(parse('0.30000000000000004', 6), 300_000n)
assert.equal(parse('1', 6), 1_000_000n)
assert.equal(parse('.5', 6), 500_000n)
assert.equal(parse('12.5', 18), 12_500_000_000_000_000_000n)

// Belum berupa angka: null, bukan lemparan. Kolom input dalam keadaan diketik.
for (const bad of ['', '.', 'abc', '1e-7', '-1', '1.2.3', ' ', '0', '0.0']) {
  assert.equal(parse(bad, 6), null, `${JSON.stringify(bad)} harus null`)
}

// Token 6 desimal tidak boleh diam-diam menerima presisi yang tidak ada.
assert.equal(parse('0.0000001', 6), null, 'di bawah satuan terkecil bukan angka positif')

console.log('check-amount: semua lolos')
