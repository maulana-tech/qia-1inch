// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Calldata } from "@1inch/solidity-utils/contracts/libraries/Calldata.sol";

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";

library ExclusiveFillArgsBuilder {
    /// @param taker Satu-satunya alamat yang boleh mengeksekusi order ini.
    function build(address taker) internal pure returns (bytes memory) {
        return abi.encodePacked(taker);
    }
}

/// @title ExclusiveFill
/// @notice Instruksi SwapVM: order hanya boleh dieksekusi oleh satu alamat.
///
/// # Untuk apa
///
/// Ini separuh maker dari kesepakatan aliran order eksklusif. Market maker
/// bersedia mengutip harga lebih rapat kalau ia tahu siapa lawannya — arus dari
/// satu penyalur yang dikenal jauh lebih jinak daripada arus terbuka yang
/// didominasi arbitrageur. Tanpa gerbang ini, kuotasi rapat itu langsung dipanen
/// bot dalam blok yang sama.
///
/// Kuotasi eksklusif seperti ini lumrah di RFQ dan meja OTC. Yang baru: di sini
/// syaratnya ditegakkan oleh mesin virtual di dalam order itu sendiri, bukan
/// oleh perjanjian di luar rantai.
///
/// # Kenapa tidak memakai `PrivateOrder` bawaan SwapVM
///
/// Gerbang itu mencocokkan alamat secara sebagian demi menghemat gas, sehingga
/// alamat lain bisa ikut lolos — lihat `COLLISION_TAKER` di
/// `test/PrivateOrder.t.sol` milik SwapVM. Untuk kesepakatan eksklusif,
/// cocok-sebagian tidak memadai. Di sini perbandingannya penuh 20 byte.
///
/// # Keamanan
///
/// Tidak bisa dipalsukan: `ctx.query.taker` di-set SwapVM dari `msg.sender`,
/// bukan dari data yang dikirim taker.
contract ExclusiveFill {
    using Calldata for bytes;

    error ExclusiveFillMissingTakerArg();
    error ExclusiveFillTakerNotAllowed(address taker, address expected);

    /// @dev Membatalkan swap kalau pemanggil bukan alamat yang ditunjuk.
    /// @param args.taker | 20 byte
    function _onlyExclusiveTaker(Context memory ctx, bytes calldata args) internal pure {
        address allowed = address(bytes20(args.slice(0, 20, ExclusiveFillMissingTakerArg.selector)));
        require(ctx.query.taker == allowed, ExclusiveFillTakerNotAllowed(ctx.query.taker, allowed));
    }
}
