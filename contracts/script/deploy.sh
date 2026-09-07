#!/usr/bin/env bash
# Deploy meja Aqua dan kirim posisi pertama. Satu perintah untuk semua rantai.
#
#   # anvil lokal
#   ./script/deploy.sh
#
#   # Base Sepolia (butuh ETH testnet di dompetmu)
#   RPC=https://sepolia.base.org DESK_KEY=0x<kunci-privat> ./script/deploy.sh
#
# Aqua di-deploy lebih dulu lalu alamatnya diberikan ke skrip demo. Dulu skrip
# itu MENEBAK alamat Aqua dari nonce deployer, yang hanya benar di rantai baru
# dengan akun yang belum pernah dipakai — di dompet testnet sungguhan, meleset.
set -euo pipefail

RPC=${RPC:-http://127.0.0.1:8545}
DESK_KEY=${DESK_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

if ! command -v cast >/dev/null 2>&1; then
  echo "cast tidak ditemukan. Pasang Foundry, atau tambahkan ke PATH:"
  echo "  export PATH=\"\$PATH:\$HOME/.foundry/bin\""
  exit 1
fi

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Tidak bisa menghubungi $RPC."
  exit 1
fi

CHAIN=$(cast chain-id --rpc-url "$RPC")
DEPLOYER=$(cast wallet address --private-key "$DESK_KEY")
BAL=$(cast balance "$DEPLOYER" --rpc-url "$RPC")
echo "chain $CHAIN | deployer $DEPLOYER | saldo $(cast to-unit "$BAL" ether) ETH"

if [ "$BAL" = "0" ]; then
  echo "Deployer tidak punya ETH di rantai ini. Isi dulu lewat faucet."
  exit 1
fi

echo "1. men-deploy Aqua"
AQUA=$(forge create lib/aqua/src/Aqua.sol:Aqua \
  --rpc-url "$RPC" --private-key "$DESK_KEY" --broadcast \
  2>/dev/null | awk '/Deployed to:/{print $3}')
[ -n "$AQUA" ] || { echo "gagal men-deploy Aqua"; exit 1; }
echo "   Aqua: $AQUA"

echo "2. men-deploy meja dan mengirim posisi"
AQUA="$AQUA" DESK_KEY="$DESK_KEY" \
  forge script script/DemoIqiaDesk.s.sol --rpc-url "$RPC" --broadcast \
  --private-key "$DESK_KEY" | tee /tmp/iqia-deploy.log

ENVFILE="$(cd "$(dirname "$0")/../../frontend" && pwd)/.env.$CHAIN"
echo "# Ditulis otomatis oleh contracts/script/deploy.sh. Jangan disunting tangan." > "$ENVFILE"
grep -o 'VITE_[A-Z_]*=[^ ]*' /tmp/iqia-deploy.log >> "$ENVFILE"
if [ "$RPC" != "http://127.0.0.1:8545" ]; then
  echo "VITE_RPC_URL=$RPC" >> "$ENVFILE"
fi

echo ""
echo "=========================================="
echo "Konfigurasi frontend ditulis ke frontend/.env.$CHAIN"
echo "  cp frontend/.env.$CHAIN frontend/.env.local && pnpm --filter frontend dev"
echo "=========================================="
