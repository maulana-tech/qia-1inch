#!/usr/bin/env bash
# Menambah dua pasar ke deployment yang SUDAH ADA, memakai modal yang sama.
#
# Sesudah ini, halaman /desk menunjukkan efisiensi modal di atas 1x: satu
# tumpukan WETH mengutip di tiga pasar sekaligus.
#
#   DESK_KEY=0x<kunci-privat> ./script/add-markets.sh
#
# Kunci privatnya tidak pernah keluar dari mesinmu. Skrip ini meneruskannya ke
# forge sebagai variabel lingkungan, dan tidak mencetaknya ke mana pun.
set -euo pipefail

ENVFILE="$(cd "$(dirname "$0")/../../frontend" && pwd)/.env.local"
RPC=${RPC:-https://ethereum-sepolia-rpc.publicnode.com}

if ! command -v cast >/dev/null 2>&1; then
  echo "cast tidak ditemukan. export PATH=\"\$PATH:\$HOME/.foundry/bin\""
  exit 1
fi
if [ -z "${DESK_KEY:-}" ]; then
  echo "DESK_KEY belum diisi. Pakai kunci yang sama dengan yang men-deploy:"
  echo "  DESK_KEY=0x<kunci-privat> ./script/add-markets.sh"
  exit 1
fi
if [ ! -f "$ENVFILE" ]; then
  echo "frontend/.env.local tidak ada. Salin dulu dari .env.sepolia.example."
  exit 1
fi

read_env() { grep -E "^$1=" "$ENVFILE" | head -1 | cut -d= -f2-; }
AQUA=$(read_env VITE_AQUA)
ROUTER=$(read_env VITE_SWAP_VM_ROUTER)
WETH_ADDR=$(read_env VITE_WETH_ADDRESS)
[ -n "$AQUA" ] && [ -n "$ROUTER" ] && [ -n "$WETH_ADDR" ] || { echo "env kurang lengkap"; exit 1; }

echo "chain $(cast chain-id --rpc-url "$RPC") | Aqua $AQUA | router $ROUTER"

deploy_token() {
  forge create src/MockERC20.sol:MockERC20 --rpc-url "$RPC" --private-key "$DESK_KEY" --broadcast \
    --constructor-args "$1" "$2" "$3" 2>/dev/null | awk '/Deployed to:/{print $3}'
}

# Token di-deploy lewat `forge create`, bukan `new` di dalam skrip Solidity:
# forge gagal menguraikan argumen konstruktor yang mengandung `string`, dan
# kegagalan itu membatalkan SELURUH broadcast — termasuk transaksi yang berhasil.
echo "1. men-deploy dua token sisi lawan"
QUOTE_A=$(deploy_token "Test Dai" "DAI" 6)
QUOTE_B=$(deploy_token "Test Wrapped Bitcoin" "WBTC" 6)
[ -n "$QUOTE_A" ] && [ -n "$QUOTE_B" ] || { echo "gagal men-deploy token"; exit 1; }
echo "   DAI  $QUOTE_A"
echo "   WBTC $QUOTE_B"

echo "2. mengirim dua posisi dengan modal WETH yang sama"
AQUA="$AQUA" ROUTER="$ROUTER" WETH_ADDR="$WETH_ADDR" \
QUOTE_A="$QUOTE_A" QUOTE_B="$QUOTE_B" DESK_KEY="$DESK_KEY" \
  forge script script/AddMarkets.s.sol --rpc-url "$RPC" --broadcast --private-key "$DESK_KEY"

# Alamat token baru ditambahkan ke env, supaya frontend mengenali simbolnya.
grep -v -E '^VITE_(DAI|WBTC)_ADDRESS=' "$ENVFILE" > "$ENVFILE.tmp"
{
  echo "VITE_DAI_ADDRESS=$QUOTE_A"
  echo "VITE_WBTC_ADDRESS=$QUOTE_B"
} >> "$ENVFILE.tmp"
mv "$ENVFILE.tmp" "$ENVFILE"

echo ""
echo "=========================================="
echo "Selesai. frontend/.env.local sudah diperbarui."
echo "  pnpm --filter frontend dev   lalu buka /desk"
echo "=========================================="
