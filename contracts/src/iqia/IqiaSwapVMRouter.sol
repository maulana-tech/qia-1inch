// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";
import { SwapVM } from "@1inch/swap-vm/src/SwapVM.sol";

import { IqiaOpcodes } from "./IqiaOpcodes.sol";

/// @title IqiaSwapVMRouter
/// @notice Router SwapVM milik Iqia. Menjalankan program strategi yang bersandar
///   pada saldo Aqua, dengan set instruksi Iqia.
///
/// @dev Kontrak ini sekaligus menjadi **Aqua app**-nya. Di mode Aqua, argumen
///   `app` pada `aqua.ship()` adalah alamat router, jadi satu kontrak memenuhi
///   dua peran: mesin eksekusi strategi, dan pihak yang berhak memanggil
///   `pull()`/`push()` atas nama maker.
///
/// @dev Ini redeploy SwapVM yang dimodifikasi, bukan pemanggil SwapVM resmi.
///   Menambah opcode memang menuntut itu — set instruksi ditentukan saat
///   kompilasi lewat `_instructions()`.
contract IqiaSwapVMRouter is Simulator, SwapVM, IqiaOpcodes {
    /// @dev Nama dan versi domain EIP-712 ditanam, bukan jadi argumen.
    ///
    ///   Alasannya dua. Yang benar: domain EIP-712 adalah identitas kontrak,
    ///   bukan sesuatu yang pantas berbeda antar deployment.
    ///
    ///   Yang memaksa: dengan dua argumen `string`, `forge script` GAGAL
    ///   menguraikan argumen konstruktor saat menulis artefak broadcast
    ///   ("type check failed for offset"), dan kegagalan itu membatalkan
    ///   SELURUH broadcast — termasuk transaksi yang sudah berhasil. Ia sempat
    ///   lolos beberapa kali, lalu berhenti lolos setelah perubahan komentar
    ///   yang menggeser metadata bytecode. Ketergantungan pada kebetulan itu
    ///   dihapus dengan membuat konstruktornya panjang-tetap.
    ///
    /// @param aqua Registry saldo virtual Aqua
    /// @param weth WETH, untuk dukungan unwrap. Boleh address(0) kalau tidak dipakai
    /// @param owner Hanya owner yang bisa menyelamatkan dana yang nyangkut
    constructor(address aqua, address weth, address owner)
        SwapVM(aqua, weth, owner, "IqiaSwapVM", "1.0.0")
        IqiaOpcodes(aqua)
    { }

    function _instructions()
        internal
        pure
        override
        returns (function(Context memory, bytes calldata) internal[] memory)
    {
        return _opcodes();
    }
}
