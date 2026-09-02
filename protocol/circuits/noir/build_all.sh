#!/usr/bin/env bash
#
# Build, test, prove, and export VKs for all five LaxStell circuits.
#
# Usage (from anywhere):
#   source <repo>/env.sh        # put pinned nargo 1.0.0-beta.9 + bb 0.87.0 on PATH
#   <repo>/circuits/noir/build_all.sh
#
# For each circuit this:
#   1. nargo test            -- runs the in-circuit unit tests
#   2. nargo compile         -- produces target/<circuit>.json
#   3. nargo execute witness -- solves the witness from Prover.toml
#   4. bb prove              -- UltraHonk + keccak transcript, bytes_and_fields
#   5. bb write_vk           -- exports the verification key
#   6. verifies proof == 14592 bytes and vk == 1760 bytes (SHARED sec 6/8)
#   7. copies vk + a sample proof + public_inputs into circuits/artifacts/<circuit>/
#
# Exits non-zero on the first failure.

set -euo pipefail

CIRCUITS=(withdraw transfer place_order match_orders cancel_order)

# Resolve directories relative to this script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../circuits/noir
CIRCUITS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"               # .../circuits
ARTIFACTS_DIR="${CIRCUITS_DIR}/artifacts"

EXPECTED_PROOF_BYTES=14592
EXPECTED_VK_BYTES=1760

command -v nargo >/dev/null 2>&1 || { echo "nargo not on PATH -- 'source env.sh' first"; exit 1; }
command -v bb    >/dev/null 2>&1 || { echo "bb not on PATH -- 'source env.sh' first";    exit 1; }

echo "nargo: $(nargo --version | head -1)"
echo "bb:    $(bb --version)"
echo

filesize() { wc -c < "$1" | tr -d ' '; }

for c in "${CIRCUITS[@]}"; do
  echo "=============================================================="
  echo "Circuit: ${c}"
  echo "=============================================================="
  pkg="${SCRIPT_DIR}/${c}"

  ( cd "${pkg}"

    echo "[1/5] nargo test"
    nargo test

    echo "[2/5] nargo compile"
    nargo compile

    echo "[3/5] nargo execute witness"
    nargo execute witness

    echo "[4/5] bb prove"
    bb prove --scheme ultra_honk --oracle_hash keccak \
      -b "target/${c}.json" -w target/witness.gz -o target \
      --output_format bytes_and_fields

    echo "[5/6] bb write_vk"
    bb write_vk --scheme ultra_honk --oracle_hash keccak \
      -b "target/${c}.json" -o target \
      --output_format bytes_and_fields

    echo "[6/6] bb write_solidity_verifier"
    bb write_solidity_verifier --scheme ultra_honk -k target/vk -o target/HonkVerifier.sol
    
    # CamelCase the circuit name, e.g. place_order -> PlaceOrder
    cam_c=$(echo "$c" | awk -F_ '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1' OFS="")
    contract_name="${cam_c}Verifier"
    
    # Rename contract and downgrade pragma
    sed -i '' "s/contract HonkVerifier/contract ${contract_name}/g" target/HonkVerifier.sol
    sed -i '' "s/function HonkVerifier/function ${contract_name}/g" target/HonkVerifier.sol
    sed -i '' "s/pragma solidity ^0.8.27;/pragma solidity ^0.8.20;/g" target/HonkVerifier.sol
    
    mv target/HonkVerifier.sol "target/${contract_name}.sol"
  )

  proof_bytes="$(filesize "${pkg}/target/proof")"
  vk_bytes="$(filesize "${pkg}/target/vk")"
  pi_bytes="$(filesize "${pkg}/target/public_inputs")"

  if [[ "${proof_bytes}" != "${EXPECTED_PROOF_BYTES}" ]]; then
    echo "FAIL: ${c} proof is ${proof_bytes} bytes, expected ${EXPECTED_PROOF_BYTES}"
    exit 1
  fi
  if [[ "${vk_bytes}" != "${EXPECTED_VK_BYTES}" ]]; then
    echo "FAIL: ${c} vk is ${vk_bytes} bytes, expected ${EXPECTED_VK_BYTES}"
    exit 1
  fi
  echo "OK: proof=${proof_bytes} B, vk=${vk_bytes} B, public_inputs=${pi_bytes} B ($((pi_bytes / 32)) fields)"

  # Copy deployment/integration fixtures.
  out="${ARTIFACTS_DIR}/${c}"
  mkdir -p "${out}"
  cam_c=$(echo "$c" | awk -F_ '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1' OFS="")
  contract_name="${cam_c}Verifier"

  cp "${pkg}/target/vk"             "${out}/vk"
  cp "${pkg}/target/proof"          "${out}/proof"
  cp "${pkg}/target/public_inputs"  "${out}/public_inputs"
  cp "${pkg}/target/${contract_name}.sol" "${out}/${contract_name}.sol"
  
  # Also copy to bridge workspace
  mkdir -p "../../bridge/l1/src/verifiers"
  cp "${pkg}/target/${contract_name}.sol" "../../bridge/l1/src/verifiers/${contract_name}.sol"
  echo "Artifacts -> ${out}/{vk,proof,public_inputs}"
  echo
done

echo "All circuits built. Proof=${EXPECTED_PROOF_BYTES} B, VK=${EXPECTED_VK_BYTES} B confirmed for each."
