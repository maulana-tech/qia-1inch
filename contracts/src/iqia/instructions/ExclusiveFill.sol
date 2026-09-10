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
/// `PrivateOrder` membandingkan **10 byte terakhir** alamat saja, demi menghemat
/// gas — dan dokumennya sendiri menyebut konsekuensinya:
///
/// > Address packing trade-off: only the last 10 bytes of each address are
/// > compared. […] Birthday attack 80-bit collisions are feasible, however both
/// > accounts are controlled by a single attacker, not a bypass.
/// >
/// > — `contracts/instructions/Whitelist.sol`, 1inch/swap-vm
///
/// Argumen "bukan bypass" itu benar untuk kasus yang mereka pikirkan: penyerang
/// yang menambang dua alamat miliknya sendiri tidak mendapat apa-apa. Tapi
/// pihak yang dirugikan di sini bukan penyerang, melainkan **maker** — nilai
/// gerbang ini justru terletak pada jaminan bahwa yang mengisi order adalah
/// penyalur yang namanya tertulis, bukan pihak lain yang 80 bit terakhirnya
/// kebetulan sama. Untuk kesepakatan aliran order eksklusif, "hampir pasti dia"
/// bukan jaminan yang bisa dipakai berunding.
///
/// Maka di sini perbandingannya penuh 20 byte. Biayanya 10 byte tambahan per
/// order. Selisihnya dibuktikan di `test_Gate_RejectsHighBitsCollision`: satu
/// alamat yang 80 bit terakhirnya identik dengan penyalur yang ditunjuk —
/// diterima `PrivateOrder`, ditolak di sini.
///
/// Instruksi ini ditulis sebelum `PrivateOrder` ada di SwapVM (pin kita,
/// commit 32c687c, belum memuatnya) dan dipertahankan setelahnya karena
/// alasan di atas, bukan karena tidak tahu.
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
