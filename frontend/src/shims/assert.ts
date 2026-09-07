/**
 * Pengganti modul `assert` Node untuk browser.
 *
 * `@1inch/aqua-sdk` — lewat `@1inch/sdk-core` — memanggil `assert()` di dalam
 * `Address` dan `HexString`. Modul itu tidak ada di browser, dan karena
 * `AQUA_CONTRACT_ADDRESSES` membangun objek `Address` saat modul dimuat,
 * mengimpor SDK-nya sama sekali langsung melempar
 * `import_assert.default is not a function` dan halamannya kosong.
 *
 * Yang dipakai SDK cuma bentuk `assert(nilai, pesan)`, jadi ini cukup. Ia tetap
 * melempar seperti aslinya — bukan diam-diam meloloskan — supaya alamat atau
 * hex yang tidak valid tetap ketahuan.
 */
export default function assert(value: unknown, message?: string | Error): asserts value {
  if (value) return
  throw message instanceof Error ? message : new Error(message ?? 'Assertion failed')
}

export const ok = assert
