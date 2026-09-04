// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Fee, FeeArgsBuilder } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";

import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { SolvencyGuard, SolvencyGuardArgsBuilder } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Posisi tabungan harus benar-benar menghasilkan.
///
/// @dev Test ini ada karena versi pertama fitur Savings TIDAK memungut fee.
///   Programnya cuma SolvencyGuard + XYCSwap, sementara antarmukanya menjanjikan
///   "mengumpulkan fee". Pada kurva murni tanpa fee, penukar mendapat harga adil
///   dan maker hanya menanggung pergerakan inventarisnya — persis cacat yang
///   membuat SimpleAMM lama tidak berguna bagi penyedia likuiditasnya.
///
///   Kesalahan seperti itu tidak terlihat dari layar mana pun: posisinya tetap
///   melayani swap, angkanya tetap bergerak, dan tidak ada yang gagal. Karena itu
///   dikunci di sini.
contract SavingsProgramTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    IqiaSwapVMRouter public router;
    TokenMock public tokenA;
    TokenMock public tokenB;

    address public saver;
    address public taker;

    uint256 constant BAL_A = 100e18;
    uint256 constant BAL_B = 200e18;
    uint256 constant SWAP_AMOUNT = 20e18;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.003e9; // 0,3% — bawaan SAVINGS_FEE_BPS

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        saver = vm.addr(0x5A);
        taker = vm.addr(0x7A);
        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this), "IqiaSwapVM", "1.0.0");
    }

    /// @dev Bentuknya harus sama persis dengan `savingsProgram` di
    ///   frontend/src/lib/savings.ts, termasuk URUTANNYA.
    function _savingsProgram(bool withFee, uint64 saltValue) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            withFee ? p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)) : bytes(""),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(saltValue))
        );
    }

    function _order(bytes memory prog) internal view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: saver, receiver: address(0), shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true, allowZeroAmountIn: false,
            hasPreTransferInHook: false, hasPostTransferInHook: false,
            hasPreTransferOutHook: false, hasPostTransferOutHook: false,
            preTransferInTarget: address(0), preTransferInData: "",
            postTransferInTarget: address(0), postTransferInData: "",
            preTransferOutTarget: address(0), preTransferOutData: "",
            postTransferOutTarget: address(0), postTransferOutData: "",
            program: prog
        }));
    }

    function _takerData() internal view returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: taker, isExactIn: true, shouldUnwrapWeth: false,
            isStrictThresholdAmount: false, isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: true,
            threshold: "", to: address(0), deadline: 0,
            hasPreTransferInCallback: false, hasPreTransferOutCallback: false,
            preTransferInHookData: "", postTransferInHookData: "",
            preTransferOutHookData: "", postTransferOutHookData: "",
            preTransferInCallbackData: "", preTransferOutCallbackData: "",
            instructionsArgs: "", signature: ""
        }));
    }

    function _ship(ISwapVM.Order memory order) internal {
        deal(address(tokenA), saver, BAL_A);
        deal(address(tokenB), saver, BAL_B);
        vm.startPrank(saver);
        tokenA.approve(address(AQUA), type(uint256).max);
        tokenB.approve(address(AQUA), type(uint256).max);
        AQUA.ship(address(router), abi.encode(order),
            dynamic([address(tokenA), address(tokenB)]), dynamic([BAL_A, BAL_B]));
        vm.stopPrank();
    }

    function _swap(ISwapVM.Order memory order) internal returns (uint256 amountOut) {
        deal(address(tokenB), taker, SWAP_AMOUNT);
        vm.startPrank(taker);
        tokenB.approve(address(router), type(uint256).max);
        (, amountOut,) = router.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData());
        vm.stopPrank();
    }

    /// @notice Posisi dengan fee menyerahkan lebih sedikit — selisihnya milik penabung.
    function test_SavingsPositionEarnsAFee() public {
        ISwapVM.Order memory withFee = _order(_savingsProgram(true, 1));
        ISwapVM.Order memory noFee = _order(_savingsProgram(false, 2));

        _ship(withFee);
        uint256 outWithFee = _swap(withFee);

        _ship(noFee);
        uint256 outNoFee = _swap(noFee);

        assertLt(outWithFee, outNoFee, "fee harus menahan sebagian keluaran untuk penabung");

        // 0,3% dari masukan tidak masuk kurva, jadi selisihnya sekitar 0,3% keluaran.
        uint256 gain = outNoFee - outWithFee;
        assertGt(gain, (outNoFee * 25) / 10_000, "penghasilannya terlalu kecil untuk fee 0,3%");
        assertLt(gain, (outNoFee * 35) / 10_000, "penghasilannya terlalu besar untuk fee 0,3%");
    }

    /// @dev Versi tanpa fee sengaja diuji juga: ia TETAP melayani swap dan tidak
    ///   pernah gagal, dan justru itu sebabnya cacatnya bisa lolos tanpa test.
    function test_WithoutFeeThePositionStillWorksButEarnsNothing() public {
        ISwapVM.Order memory noFee = _order(_savingsProgram(false, 3));
        _ship(noFee);

        uint256 amountOut = _swap(noFee);
        uint256 pureCurve = (SWAP_AMOUNT * BAL_A) / (BAL_B + SWAP_AMOUNT);

        assertEq(amountOut, pureCurve, "tanpa fee, penukar mendapat harga kurva murni");
    }
}
