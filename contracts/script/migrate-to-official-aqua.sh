#!/usr/bin/env bash
# Memindahkan meja ke registry Aqua RESMI 1inch.
#
# Cara yang dianjurkan — keystore Foundry, kunci tetap terenkripsi di disk:
#
#   cast wallet import desk --interactive     # sekali saja, tempel kunci di sini
#   DESK_ACCOUNT=desk ./script/migrate-to-official-aqua.sh
#
# Cara lama, kunci mentah. Hanya untuk anvil atau dompet sekali pakai:
#
#   DESK_KEY=0x<kunci-privat> ./script/migrate-to-official-aqua.sh
#
# Kunci mentah di variabel lingkungan bocor ke riwayat shell, ke daftar proses,
# dan ke log mana pun yang merekam lingkungan. Keystore tidak.
#
# Yang dilakukan:
#   1. memastikan Aqua resmi benar-benar ada di rantai yang dipakai env
#   2. men-deploy ulang IqiaSwapVMRouter terhadap registry resmi itu
#   3. memberi izin token ke registry resmi, lalu mengirim satu posisi
#   4. memperbarui frontend/.env.local
#
# Aqua lama TIDAK disentuh. `ship()` tidak memindahkan token, jadi posisi yang
# tertinggal di sana bukan dana yang terjebak — cuma catatan alokasi yang tidak
# lagi dibaca siapa pun. Menutupnya opsional dan tidak mengubah saldo dompet.
set -euo pipefail

# Aqua resmi 1inch. Alamat yang sama di 16 rantai, dan di testnet HANYA ada di
# Ethereum Sepolia — Base/Arbitrum/Optimism Sepolia semuanya kosong di alamat
# ini. Bytecode-nya di Sepolia byte-identik dengan yang di Base mainnet.
OFFICIAL_AQUA=0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a

ENVFILE="$(cd "$(dirname "$0")/../../frontend" && pwd)/.env.local"

if ! command -v cast >/dev/null 2>&1; then
  echo "cast tidak ditemukan. export PATH=\"\$PATH:\$HOME/.foundry/bin\""
  exit 1
fi
if [ -z "${DESK_ACCOUNT:-}" ] && [ -z "${DESK_KEY:-}" ]; then
  echo "Belum ada cara menandatangani. Yang dianjurkan:"
  echo "  cast wallet import desk --interactive"
  echo "  DESK_ACCOUNT=desk ./script/migrate-to-official-aqua.sh"
  exit 1
fi
if [ ! -f "$ENVFILE" ]; then
  echo "frontend/.env.local tidak ada."
  exit 1
fi

read_env() { grep -E "^$1=" "$ENVFILE" | head -1 | cut -d= -f2-; }

# Baca dan tulis lewat endpoint BERBEDA, dan itu bukan gaya-gayaan.
#
# tenderly andal untuk eth_getLogs — terukur 30 dari 30 panggilan benar,
# sementara publicnode menjatuhkan sekitar separuhnya secara diam-diam. Tapi
# tenderly membatasi eth_sendRawTransaction dan menolak dengan "rate limit
# exceeded" pada transaksi pertama, yang sudah menjatuhkan skrip ini sekali.
#
# Jadi: baca lewat yang jujur, kirim lewat yang mau menerima.
RPC=${RPC:-$(read_env VITE_RPC_URL)}
RPC=${RPC:-https://sepolia.gateway.tenderly.co}
WRITE_RPC=${WRITE_RPC:-https://ethereum-sepolia-rpc.publicnode.com}
WETH_ADDR=$(read_env VITE_WETH_ADDRESS)
USDC_ADDR=$(read_env VITE_USDC_ADDRESS)
OLD_AQUA=$(read_env VITE_AQUA)

[ -n "$WETH_ADDR" ] && [ -n "$USDC_ADDR" ] || { echo "VITE_WETH_ADDRESS / VITE_USDC_ADDRESS kosong"; exit 1; }

CHAIN=$(cast chain-id --rpc-url "$RPC")

# Argumen penanda tangan dirakit sekali, dipakai di semua panggilan forge.
if [ -n "${DESK_ACCOUNT:-}" ]; then
  DEPLOYER=$(cast wallet address --account "$DESK_ACCOUNT")
  SIGN_ARGS=(--account "$DESK_ACCOUNT" --sender "$DEPLOYER")
  SIGN_ENV=(MAKER="$DEPLOYER")
else
  DEPLOYER=$(cast wallet address --private-key "$DESK_KEY")
  SIGN_ARGS=(--private-key "$DESK_KEY")
  SIGN_ENV=(DESK_KEY="$DESK_KEY")
fi

echo "chain $CHAIN | maker $DEPLOYER"
echo "Aqua lama  : $OLD_AQUA"
echo "Aqua resmi : $OFFICIAL_AQUA"
echo ""

# Penjaga paling penting di skrip ini. Panggilan ke alamat tanpa kode BERHASIL
# secara diam-diam di EVM, jadi tanpa pemeriksaan ini env-mu akan menunjuk
# registry kosong dan halaman Markets akan kosong selamanya tanpa satu pun galat.
CODE=$(cast code "$OFFICIAL_AQUA" --rpc-url "$RPC")
if [ "$CODE" = "0x" ] || [ -z "$CODE" ]; then
  echo "Aqua resmi TIDAK ada di chain $CHAIN."
  echo "Di testnet ia hanya ada di Ethereum Sepolia (chain 11155111)."
  exit 1
fi
echo "Aqua resmi terverifikasi: $(printf '%s' "$CODE" | wc -c | tr -d ' ') char bytecode"

BAL=$(cast balance "$DEPLOYER" --rpc-url "$RPC")
[ "$BAL" != "0" ] || { echo "maker tidak punya ETH untuk gas"; exit 1; }

# Diambil SEBELUM broadcast. Kalau diambil sesudahnya, blok tempat posisi kita
# dikirim sudah lewat, dan sapuan log frontend akan melewatkannya.
FROM_BLOCK=$(cast block-number --rpc-url "$RPC")

echo ""
echo "Men-deploy router dan mengirim posisi…"
AQUA="$OFFICIAL_AQUA" WETH_ADDR="$WETH_ADDR" USDC_ADDR="$USDC_ADDR" "${SIGN_ENV[@]}" \
  forge script script/MigrateToOfficialAqua.s.sol --rpc-url "$WRITE_RPC" --broadcast \
  "${SIGN_ARGS[@]}" | tee /tmp/iqia-migrate.log

NEW_ROUTER=$(grep -o 'VITE_SWAP_VM_ROUTER=0x[0-9a-fA-F]*' /tmp/iqia-migrate.log | tail -1 | cut -d= -f2)
[ -n "$NEW_ROUTER" ] || { echo "gagal membaca alamat router dari keluaran forge"; exit 1; }

# Env ditulis ulang hanya untuk kunci yang berubah; sisanya dipertahankan apa
# adanya supaya alamat token, faucet, dan RPC pilihanmu tidak ikut hilang.
#
# MARKETS_LOOKBACK_BLOCKS diisi supaya sapuan memakai jendela bergulir, bukan
# mulai dari blok deploy kita. Di registry resmi ada maker lain, dan posisi
# mereka lebih tua daripada router kita — dengan lookback nol, mereka tidak akan
# pernah masuk jangkauan.
grep -v -E '^(VITE_AQUA|VITE_SWAP_VM_ROUTER|VITE_POOL_DEPLOY_BLOCK|VITE_MARKETS_LOOKBACK_BLOCKS)=' "$ENVFILE" > "$ENVFILE.tmp"
{
  echo "VITE_AQUA=$OFFICIAL_AQUA"
  echo "VITE_SWAP_VM_ROUTER=$NEW_ROUTER"
  echo "VITE_POOL_DEPLOY_BLOCK=$FROM_BLOCK"
  echo "VITE_MARKETS_LOOKBACK_BLOCKS=45000"
} >> "$ENVFILE.tmp"
mv "$ENVFILE.tmp" "$ENVFILE"

echo ""
echo "=========================================="
echo "Selesai."
echo "  Aqua   : $OFFICIAL_AQUA  (resmi 1inch)"
echo "  Router : $NEW_ROUTER"
echo "  Blok   : $FROM_BLOCK"
echo ""
echo "frontend/.env.local sudah diperbarui. Jalankan ulang dev server:"
echo "  pnpm --filter frontend dev"
echo ""
echo "Posisi lamamu di $OLD_AQUA tetap di sana dan tidak menahan dana apa pun."
echo "=========================================="
