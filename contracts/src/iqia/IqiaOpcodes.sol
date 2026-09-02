// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";
import { AquaOpcodes } from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";

import { ExclusiveFill } from "./instructions/ExclusiveFill.sol";
import { SolvencyGuard } from "./instructions/SolvencyGuard.sol";

/// @title IqiaOpcodes
/// @notice Set instruksi SwapVM milik Iqia: seluruh opcode Aqua, ditambah dua
///   instruksi khusus aplikasi ini.
///
/// # Cara menambah opcode di SwapVM
///
/// `_opcodes()` mengembalikan array pointer fungsi. **Indeks di array itulah
/// nomor opcode-nya**, jadi menyisipkan di tengah akan menggeser semua nomor
/// setelahnya dan merusak setiap program yang sudah ditandatangani.
///
/// SwapVM mengantisipasi ini dengan menyediakan slot cadangan berisi
/// `_notInstruction`. Menimpa slot cadangan menambah instruksi tanpa menggeser
/// apa pun. Ini pola yang sama dipakai `Debug` lewat `_injectDebugOpcodes`,
/// yang menempati slot 0 sampai 4.
///
/// Iqia menempati dua slot cadangan pertama setelah blok fee.
///
/// @dev Nomor slotnya diverifikasi saat dijalankan, bukan diasumsikan: kalau
///   versi SwapVM berikutnya mengisi slot itu, `_opcodes()` akan langsung gagal
///   alih-alih diam-diam menimpa instruksi orang lain.
contract IqiaOpcodes is AquaOpcodes, ExclusiveFill, SolvencyGuard {
    /// @dev Slot cadangan pertama setelah `Fee._flatFeeAmountInXD`.
    uint256 internal constant OPCODE_EXCLUSIVE_FILL = 22;
    uint256 internal constant OPCODE_SOLVENCY_GUARD = 23;

    error IqiaOpcodeSlotAlreadyTaken(uint256 slot);

    constructor(address aqua) AquaOpcodes(aqua) SolvencyGuard(aqua) { }

    function _opcodes()
        internal
        pure
        virtual
        override
        returns (function(Context memory, bytes calldata) internal[] memory result)
    {
        result = super._opcodes();

        _requireFreeSlot(result, OPCODE_EXCLUSIVE_FILL);
        _requireFreeSlot(result, OPCODE_SOLVENCY_GUARD);

        result[OPCODE_EXCLUSIVE_FILL] = ExclusiveFill._onlyExclusiveTaker;
        result[OPCODE_SOLVENCY_GUARD] = SolvencyGuard._solvencyGuardXD;
    }

    /// @dev Menolak kalau slot yang mau dipakai ternyata sudah berisi instruksi.
    ///   Menimpa instruksi yang sudah ada akan mengubah arti setiap program yang
    ///   memakai nomor opcode itu — gagal keras jauh lebih baik.
    ///
    /// @dev BATASNYA: perbandingan pointer fungsi internal memicu peringatan solc
    ///   3075 dan akan dilarang sepenuhnya di rilis breaking berikutnya. Risikonya
    ///   tidak berlaku sekarang karena kontrak ini dikompilasi dengan via_ir,
    ///   bukan pipeline lama. Kalau solc menghapusnya, penjaga ini perlu ditulis
    ///   ulang — bandingkan alamatnya lewat assembly, atau pindahkan verifikasi
    ///   slot ke test. `ProgramBuilder` milik SwapVM memakai pola yang sama, jadi
    ///   perubahan itu akan menyentuh seluruh ekosistemnya sekaligus.
    function _requireFreeSlot(
        function(Context memory, bytes calldata) internal[] memory opcodes,
        uint256 slot
    ) private pure {
        require(opcodes[slot] == _notInstruction, IqiaOpcodeSlotAlreadyTaken(slot));
    }
}
