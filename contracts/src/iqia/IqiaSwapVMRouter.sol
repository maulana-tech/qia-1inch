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
    /// @param aqua Registry saldo virtual Aqua
    /// @param weth WETH, untuk dukungan unwrap. Boleh address(0) kalau tidak dipakai
    /// @param owner Hanya owner yang bisa menyelamatkan dana yang nyangkut
    /// @param name Nama domain EIP-712
    /// @param version Versi domain EIP-712
    constructor(address aqua, address weth, address owner, string memory name, string memory version)
        SwapVM(aqua, weth, owner, name, version)
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
