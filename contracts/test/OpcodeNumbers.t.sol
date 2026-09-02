// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, console } from "forge-std/Test.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Fee } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { XYCConcentrate } from "@1inch/swap-vm/src/instructions/XYCConcentrate.sol";
import { Decay } from "@1inch/swap-vm/src/instructions/Decay.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { ExclusiveFill } from "../src/iqia/instructions/ExclusiveFill.sol";
import { SolvencyGuard } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Mengunci nomor opcode yang dipakai perakit program di sisi TypeScript.
///
/// @dev Nomor opcode adalah INDEKS di array `_opcodes()`. Sisi TypeScript tidak
///   bisa memanggil `findOpcode`, jadi angkanya ditanam sebagai konstanta di
///   sana. Test ini yang menjaga keduanya tetap sinkron: kalau SwapVM menggeser
///   susunannya di versi berikutnya, test ini gagal sebelum ada program salah
///   yang terlanjur ditandatangani.
contract OpcodeNumbersTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    constructor() IqiaOpcodes(address(AQUA)) { }

    function test_OpcodeNumbersMatchTypeScriptConstants() public view {
        Program memory p = ProgramBuilder.init(_opcodes());

        assertEq(p.findOpcode(Controls._jump), 10, "JUMP");
        assertEq(p.findOpcode(Controls._deadline), 13, "DEADLINE");
        assertEq(p.findOpcode(XYCSwap._xycSwapXD), 17, "XYC_SWAP");
        assertEq(p.findOpcode(XYCConcentrate._xycConcentrateGrowLiquidity2D), 18, "XYC_CONCENTRATE");
        assertEq(p.findOpcode(Decay._decayXD), 19, "DECAY");
        assertEq(p.findOpcode(Controls._salt), 20, "SALT");
        assertEq(p.findOpcode(Fee._flatFeeAmountInXD), 21, "FLAT_FEE_IN");
        assertEq(p.findOpcode(ExclusiveFill._onlyExclusiveTaker), 22, "EXCLUSIVE_FILL");
        assertEq(p.findOpcode(SolvencyGuard._solvencyGuardXD), 23, "SOLVENCY_GUARD");

        console.log("JUMP            ", p.findOpcode(Controls._jump));
        console.log("DEADLINE        ", p.findOpcode(Controls._deadline));
        console.log("XYC_SWAP        ", p.findOpcode(XYCSwap._xycSwapXD));
        console.log("XYC_CONCENTRATE ", p.findOpcode(XYCConcentrate._xycConcentrateGrowLiquidity2D));
        console.log("DECAY           ", p.findOpcode(Decay._decayXD));
        console.log("SALT            ", p.findOpcode(Controls._salt));
        console.log("FLAT_FEE_IN     ", p.findOpcode(Fee._flatFeeAmountInXD));
        console.log("EXCLUSIVE_FILL  ", p.findOpcode(ExclusiveFill._onlyExclusiveTaker));
        console.log("SOLVENCY_GUARD  ", p.findOpcode(SolvencyGuard._solvencyGuardXD));
    }
}
