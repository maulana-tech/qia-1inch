// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, console } from "forge-std/Test.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Fee, FeeArgsBuilder } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { MakerTraits, MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { ExclusiveFill, ExclusiveFillArgsBuilder } from "../src/iqia/instructions/ExclusiveFill.sol";
import { SolvencyGuard, SolvencyGuardArgsBuilder } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Mencetak vektor golden untuk encoder di sisi TypeScript.
///
/// @dev Sisi TypeScript harus menghasilkan byte yang IDENTIK dengan Solidity —
///   satu bit meleset berarti program yang salah atau order yang ditolak. Test
///   ini mencetak keluaran resmi untuk masukan tetap; test TypeScript
///   membandingkan hasilnya dengan angka-angka ini.
///
///   Regenerasi:
///     forge test --match-test test_PrintGoldenVectors -vv
contract GoldenVectorsTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    address constant MAKER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address constant TAKER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    uint32 constant FEE_BPS = 0.003e9;
    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint256 constant SALT = 0x2A;

    constructor() IqiaOpcodes(address(AQUA)) { }

    function test_PrintGoldenVectors() public view {
        Program memory p = ProgramBuilder.init(_opcodes());

        bytes memory program = bytes.concat(
            p.build(ExclusiveFill._onlyExclusiveTaker, ExclusiveFillArgsBuilder.build(TAKER)),
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint64(SALT)))
        );
        console.log("program");
        console.logBytes(program);

        ISwapVM.Order memory order = MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: MAKER,
            receiver: address(0),
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true,
            allowZeroAmountIn: false,
            hasPreTransferInHook: false,
            hasPostTransferInHook: false,
            hasPreTransferOutHook: false,
            hasPostTransferOutHook: false,
            preTransferInTarget: address(0),
            preTransferInData: "",
            postTransferInTarget: address(0),
            postTransferInData: "",
            preTransferOutTarget: address(0),
            preTransferOutData: "",
            postTransferOutTarget: address(0),
            postTransferOutData: "",
            program: program
        }));
        console.log("orderTraits");
        console.logBytes32(bytes32(MakerTraits.unwrap(order.traits)));
        console.log("orderData");
        console.logBytes(order.data);

        bytes memory takerData = TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: TAKER,
            isExactIn: true,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: false,
            threshold: abi.encodePacked(uint256(1e18)),
            to: address(0),
            deadline: 0,
            hasPreTransferInCallback: true,
            hasPreTransferOutCallback: false,
            preTransferInHookData: "",
            postTransferInHookData: "",
            preTransferOutHookData: "",
            postTransferOutHookData: "",
            preTransferInCallbackData: "",
            preTransferOutCallbackData: "",
            instructionsArgs: "",
            signature: ""
        }));
        console.log("takerData");
        console.logBytes(takerData);

        // Bentuk program tabungan: tanpa gerbang eksklusif, tapi fee tetap ada
        // dan tetap SEBELUM kurva. Dicetak terpisah supaya urutannya ikut
        // terkunci di sisi TypeScript, bukan cuma disimpulkan dari potongan
        // vektor di atas.
        console.log("savingsProgram");
        console.logBytes(bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint64(SALT)))
        ));
    }
}
