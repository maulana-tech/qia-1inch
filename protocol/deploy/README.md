# Deploy layanan matcher

Menjalankan mesin pencocokan off-chain sebagai layanan HTTP, di belakang
reverse proxy ber-TLS.

```
browser (HTTPS)  ──►  Caddy :443  ──►  matcher :8787  ──►  Base Sepolia
```

## Prasyarat

- Node 20+ dan pnpm
- Sebuah dompet EVM yang sudah terisi gas untuk kunci panas matcher
- Domain yang mengarah ke server, kalau ingin TLS otomatis lewat Caddy

## Konfigurasi

Salin `matcher.env.example` menjadi `.env`, lalu isi. Nilai yang wajib:

| Variabel | Isi |
|---|---|
| `IQIA_RPC_URL` | Endpoint RPC jaringan target |
| `IQIA_CHAIN_ID` | 84532 untuk Base Sepolia |
| `IQIA_MATCHER_PRIVATE_KEY` | Kunci panas pembayar gas. **Jangan** yang memegang dana sungguhan |
| `IQIA_POOL_ADDRESS` | Alamat `IqiaPool` |
| `IQIA_SWAP_VM_ROUTER` | Router SwapVM custom |
| `IQIA_AQUA_ADDRESS` | Registry Aqua |

## Jalankan

```bash
pnpm --filter @iqia/matcher build
node protocol/matcher/dist/index.js
```

Frontend menunjuk ke sini lewat `VITE_MATCHER_URL`. Kalau kosong, pencocokan
mati — order tetap bisa ditempatkan dan dibatalkan, hanya tidak akan bertemu
lawan.

## Keadaan saat ini

Jalur penyelesaian sedang dipindahkan ke SwapVM. Sampai router-nya terpasang,
matcher bisa menghitung pencocokan tapi belum bisa menyelesaikannya on-chain.
Lihat [`../../docs/migrasi.md`](../../docs/migrasi.md).
