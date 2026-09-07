#!/usr/bin/env bash
# Demo di atas fork Base mainnet, memakai kontrak Aqua RESMI. Tanpa uang sungguhan.
#
# Syarat kualifikasi hackathon menyebut "local forks are ok" untuk menunjukkan
# transfer token on-chain, dan menuntut kontrak Aqua/SwapVM resmi yang dipakai.
# Fork memenuhi keduanya sekaligus: Aqua-nya kontrak asli 1inch, uangnya palsu.
#
#   ./script/fork-demo.sh
set -euo pipefail

RPC=${RPC:-http://127.0.0.1:8546}
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
WETH=0x4200000000000000000000000000000000000006

DESK_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
MAKER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
TAKER_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
MAKER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
TAKER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

# Dua kegagalan yang berbeda, dua pesan yang berbeda. Versi pertama skrip ini
# menyalahkan fork padahal yang tidak ada `cast`-nya, dan itu menyesatkan.
if ! command -v cast >/dev/null 2>&1; then
  echo "cast tidak ditemukan. Pasang Foundry, atau tambahkan ke PATH:"
  echo "  export PATH=\"\$PATH:\$HOME/.foundry/bin\""
  exit 1
fi

if ! cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Fork belum jalan di $RPC. Mulai dengan:"
  echo "  anvil --fork-url https://mainnet.base.org --port 8546 --chain-id 8453"
  exit 1
fi

# USDC di Base memakai slot 9 untuk mapping saldonya. Ditulis langsung karena
# tidak ada yang bisa mencetak USDC asli, dan meniru whale menambah kerapuhan
# tanpa menambah kejujuran demo.
set_usdc() {
  cast rpc anvil_setStorageAt "$USDC" "$(cast index address "$1" 9)" \
    "$(cast to-uint256 "$2")" --rpc-url "$RPC" >/dev/null
}

echo "1. mendanai USDC"
set_usdc "$MAKER" 35000000000   # 35.000 USDC
set_usdc "$TAKER"  3500000000   # 3.500 USDC

echo "2. membungkus ETH jadi WETH untuk maker"
cast send "$WETH" "deposit()" --value 10ether --private-key "$MAKER_KEY" --rpc-url "$RPC" >/dev/null

AQUA=0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a
DESK=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

echo "3. men-deploy router Iqia (SwapVM yang diperluas)"
# Sengaja `forge create`, bukan `new` di dalam skrip: forge gagal menguraikan
# argumen konstruktor router saat menulis artefak broadcast, dan kegagalan itu
# membatalkan SELURUH broadcast — termasuk transaksi yang sebenarnya berhasil.
ROUTER=$(forge create src/iqia/IqiaSwapVMRouter.sol:IqiaSwapVMRouter \
  --rpc-url "$RPC" --private-key "$DESK_KEY" --broadcast \
  --constructor-args "$AQUA" "$WETH" "$DESK" "IqiaSwapVM" "1.0.0" \
  2>/dev/null | awk '/Deployed to:/{print $3}')
[ -n "$ROUTER" ] || { echo "gagal men-deploy router"; exit 1; }
echo "   router: $ROUTER"

echo "4. menjalankan demo di atas Aqua RESMI"
ROUTER="$ROUTER" forge script script/DemoOnBaseFork.s.sol --rpc-url "$RPC" --broadcast \
  --private-key "$DESK_KEY"

# Env-nya ditulis di sini, bukan disalin tangan dari keluaran. Router-nya
# di-deploy ulang tiap kali skrip ini jalan, jadi alamat yang ditulis tangan
# akan basi tanpa gejala apa pun selain halaman market yang kosong.
ENVFILE="$(cd "$(dirname "$0")/../../frontend" && pwd)/.env.fork"
cat > "$ENVFILE" <<EOF
# Ditulis otomatis oleh contracts/script/fork-demo.sh. Jangan disunting tangan.
VITE_CHAIN_ID=8453
VITE_CHAIN_NAME=Base fork
VITE_RPC_URL=$RPC
VITE_EXPLORER_URL=https://basescan.org
VITE_AQUA=$AQUA
VITE_SWAP_VM_ROUTER=$ROUTER
VITE_DESK_MAKER=$MAKER
VITE_DESK_SURCHARGE_BPS=50000000
VITE_WETH_ADDRESS=$WETH
VITE_USDC_ADDRESS=$USDC
VITE_MARKETS_LOOKBACK_BLOCKS=500
EOF

echo ""
echo "=========================================="
echo "Konfigurasi frontend ditulis ke frontend/.env.fork"
echo "  cp frontend/.env.fork frontend/.env.local && pnpm --filter frontend dev"
echo "=========================================="
