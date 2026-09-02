// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Calldata } from "@1inch/solidity-utils/contracts/libraries/Calldata.sol";

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";

library ShieldedGateArgsBuilder {
    /// @param pool Alamat kolam terlindung yang boleh mengeksekusi order ini.
    function build(address pool) internal pure returns (bytes memory) {
        return abi.encodePacked(pool);
    }
}

/// @title ShieldedGate
/// @notice Instruksi SwapVM: order hanya boleh dieksekusi oleh kolam terlindung.
///
/// @dev Ini separuh maker dari tawar-menawar dark pool. Market maker bersedia
///   mengutip harga lebih rapat KARENA arus yang mengenainya bukan arbitrageur
///   publik, melainkan pengguna yang niatnya tidak pernah tersiar ke mempool.
///   Tanpa gerbang ini, kuotasi rapat itu akan langsung dipanen bot.
///
/// @dev Kenapa tidak memakai `PrivateOrder` bawaan SwapVM: gerbang itu mencocokkan
///   alamat secara sebagian demi menghemat gas, sehingga alamat lain bisa ikut
///   lolos — lihat `COLLISION_TAKER` di `test/PrivateOrder.t.sol` milik SwapVM.
///   Untuk gerbang kustodi, cocok-sebagian tidak memadai; di sini perbandingannya
///   penuh 20 byte.
///
/// @dev Aman terhadap pemalsuan: `ctx.query.taker` di-set SwapVM dari `msg.sender`,
///   bukan dari data yang dikirim taker.
contract ShieldedGate {
    using Calldata for bytes;

    error ShieldedGateMissingPoolArg();
    error ShieldedGateTakerNotAllowed(address taker, address expected);

    /// @dev Membatalkan swap kalau pemanggil bukan kolam yang ditunjuk.
    /// @param args.pool | 20 byte
    function _onlyShieldedPool(Context memory ctx, bytes calldata args) internal pure {
        address pool = address(bytes20(args.slice(0, 20, ShieldedGateMissingPoolArg.selector)));
        require(ctx.query.taker == pool, ShieldedGateTakerNotAllowed(ctx.query.taker, pool));
    }
}
