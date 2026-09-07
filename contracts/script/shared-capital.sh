#!/usr/bin/env bash
# Demo: satu kantong modal mengutip di tiga pasar sekaligus, dan menukar di satu
# pasar menggerakkan harga dua pasar lain — tanpa keeper, tanpa oracle.
#
#   anvil &
#   ./script/shared-capital.sh
set -euo pipefail

RPC=${RPC:-http://127.0.0.1:8545}
DESK_KEY=${DESK_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

if ! command -v cast >/dev/null 2>&1; then
  echo "cast tidak ditemukan. export PATH=\"\$PATH:\$HOME/.foundry/bin\""
  exit 1
fi
if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Tidak bisa menghubungi $RPC. Jalankan anvil dulu."
  exit 1
fi

echo "1. men-deploy Aqua"
AQUA=$(forge create lib/aqua/src/Aqua.sol:Aqua --rpc-url "$RPC" --private-key "$DESK_KEY" --broadcast \
  2>/dev/null | awk '/Deployed to:/{print $3}')
[ -n "$AQUA" ] || { echo "gagal men-deploy Aqua"; exit 1; }

echo "2. men-deploy router Iqia"
DESK=$(cast wallet address --private-key "$DESK_KEY")
ROUTER=$(forge create src/iqia/IqiaSwapVMRouter.sol:IqiaSwapVMRouter --rpc-url "$RPC" \
  --private-key "$DESK_KEY" --broadcast \
  --constructor-args "$AQUA" 0x0000000000000000000000000000000000000000 "$DESK" \
  2>/dev/null | awk '/Deployed to:/{print $3}')
[ -n "$ROUTER" ] || { echo "gagal men-deploy router"; exit 1; }
echo "   Aqua   $AQUA"
echo "   Router $ROUTER"

echo "3. tiga pasar dari satu kantong modal"
AQUA="$AQUA" ROUTER="$ROUTER" DESK_KEY="$DESK_KEY" \
  forge script script/DemoSharedCapital.s.sol --rpc-url "$RPC" --broadcast \
  --private-key "$DESK_KEY" | tee /tmp/iqia-shared.log

CHAIN=$(cast chain-id --rpc-url "$RPC")
ENVFILE="$(cd "$(dirname "$0")/../../frontend" && pwd)/.env.$CHAIN"
{
  echo "# Ditulis otomatis oleh contracts/script/shared-capital.sh."
  echo "VITE_CHAIN_ID=$CHAIN"
  echo "VITE_CHAIN_NAME=Anvil"
  echo "VITE_AQUA=$AQUA"
  echo "VITE_SWAP_VM_ROUTER=$ROUTER"
  echo "VITE_DESK_SURCHARGE_BPS=50000000"
  echo "VITE_MARKETS_LOOKBACK_BLOCKS=0"
  grep -o 'VITE_[A-Z_]*=[^ ]*' /tmp/iqia-shared.log
  [ "$RPC" != "http://127.0.0.1:8545" ] && echo "VITE_RPC_URL=$RPC"
} > "$ENVFILE"

echo ""
echo "=========================================="
echo "Konfigurasi ditulis ke frontend/.env.$CHAIN"
echo "  cp frontend/.env.$CHAIN frontend/.env.local && pnpm --filter frontend dev"
echo "  lalu buka /desk"
echo "=========================================="
