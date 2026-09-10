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

// --- payment link ----------------------------------------------------------
//
// Bolak-balik antara "permintaan bayar" dan "URL", diperiksa sebagai satu jalur.
// Link inilah yang menentukan siapa dibayar berapa, dan ia berpindah tangan
// lewat chat dan QR — jadi apa pun yang selamat dari perjalanan itu harus
// persis apa yang dimaksud pembuatnya.
import { buildPaymentLink, parsePaymentLink } from '../src/lib/paymentLink'

const ALICE = '0x3a8d93D5F52a26689b075A49E67F4f8924BeC84B'
const round = (req: Parameters<typeof buildPaymentLink>[0]) => {
  const url = new URL(buildPaymentLink(req, 'https://x.test'))
  return parsePaymentLink(url.pathname.split('/').pop(), url.searchParams)
}

{
  const back = round({ address: ALICE, amount: '25.5', token: 'USDC', chainId: 11155111 })
  assert.equal(back?.address, ALICE)
  assert.equal(back?.amount, '25.5')
  assert.equal(back?.token, 'USDC')
  assert.equal(back?.chainId, 11155111, 'rantainya harus selamat menyeberang')
}

// Rantai adalah alasan link ini bisa membayar aset yang salah. Ia tidak boleh
// hilang diam-diam, dan link lama tanpa rantai harus terbaca sebagai "tidak
// tahu" — bukan sebagai rantai yang sedang aktif.
{
  const back = parsePaymentLink(ALICE, new URLSearchParams(''))
  assert.equal(back?.chainId, undefined, 'link tanpa rantai jangan mengarang rantai')
}

// Nominal yang tidak masuk akal dibuang, bukan diteruskan sebagai sampah yang
// baru ketahuan saat transaksinya gagal.
for (const bad of ['abc', '0', '-5', '']) {
  const back = parsePaymentLink(ALICE, new URLSearchParams(`amount=${bad}`))
  assert.equal(back?.amount, undefined, `amount=${bad} harus dibuang`)
}

// Alamat yang bukan alamat berarti bukan permintaan bayar sama sekali.
assert.equal(parsePaymentLink('bukan-alamat', new URLSearchParams()), null)
assert.equal(parsePaymentLink(undefined, new URLSearchParams()), null)

console.log('check-payment-link: semua lolos')
