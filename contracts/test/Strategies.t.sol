// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { XYCConcentrate, XYCConcentrateArgsBuilder } from "@1inch/swap-vm/src/instructions/XYCConcentrate.sol";
import { Decay, DecayArgsBuilder } from "@1inch/swap-vm/src/instructions/Decay.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Fee, FeeArgsBuilder } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";

import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { ExclusiveFill, ExclusiveFillArgsBuilder } from "../src/iqia/instructions/ExclusiveFill.sol";
import { SolvencyGuard, SolvencyGuardArgsBuilder } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Empat strategi yang ditawarkan onboarding, diuji sebagai program.
///
/// @dev Ini gerbang sebelum UI-nya dibangun. Menawarkan pilihan strategi yang
///   ternyata tidak berkomposisi sama saja menjual sesuatu yang tidak ada, dan
///   kegagalannya baru muncul di dompet orang.
///
///   Urutan instruksinya bukan selera, dan dua aturannya ditemukan dengan cara
///   yang mahal:
///
///   1. `flatFee` harus SESUDAH `concentrate`. `AquaAccounting.t.sol` milik
///      SwapVM menandai urutan sebaliknya sebagai salah dan mengujinya sebagai
///      pembanding.
///   2. `solvencyGuard` harus SEBELUM instruksi apa pun yang membentuk saldo
///      (`concentrate`, `decay`). Ia membandingkan jaminan nyata di dompet
///      dengan `ctx.swap.balanceOut`, dan sesudah `concentrate` angka itu saldo
///      VIRTUAL yang sudah digelembungkan. Guard-nya lalu menyangka maker
///      kekurangan jaminan dan memungut surcharge palsu yang menghapus seluruh
///      keuntungan konsentrasi — tanpa ada yang gagal. Terukur: guard sesudah
///      concentrate memberi 4,742 sementara sebelum concentrate memberi 4,913,
///      persis sama dengan tanpa guard sama sekali.
///
///   Jadi urutannya:
///     [exclusiveFill] → solvencyGuard → [decay] → [concentrate] → fee → swap → salt
contract StrategiesTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    IqiaSwapVMRouter public router;
    TokenMock public tokenA;
    TokenMock public tokenB;

    address public maker;
    address public taker;
    address public outsider;

    /// @dev Seimbang, supaya harga tersiratnya 1 dan pita ±2x memuatnya.
    uint256 constant BAL = 100e18;
    uint256 constant SWAP_AMOUNT = 5e18;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.003e9;
    uint16 constant DECAY_PERIOD = 300;

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        maker = vm.addr(0xA1);
        taker = vm.addr(0xB2);
        outsider = vm.addr(0xC3);
        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this), "IqiaSwapVM", "1.0.0");
    }

    // ===== program per strategi =====

    function _santai(uint64 saltValue) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(saltValue))
        );
    }

    function _terkonsentrasi(uint64 saltValue) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(XYCConcentrate._xycConcentrateGrowLiquidity2D,
                XYCConcentrateArgsBuilder.build2D(Math.sqrt(0.5e36), Math.sqrt(2.0e36))),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(saltValue))
        );
    }

    function _antiArbitrase(uint64 saltValue) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Decay._decayXD, DecayArgsBuilder.build(DECAY_PERIOD)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(saltValue))
        );
    }

    function _mejaPrivat(address only, uint64 saltValue) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(ExclusiveFill._onlyExclusiveTaker, ExclusiveFillArgsBuilder.build(only)),
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(saltValue))
        );
    }

    // ===== perkakas =====

    function _order(bytes memory prog) internal view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: maker, receiver: address(0), shouldUnwrapWeth: false,
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

    function _takerData(address who) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: who, isExactIn: true, shouldUnwrapWeth: false,
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
        deal(address(tokenA), maker, BAL);
        deal(address(tokenB), maker, BAL);
        vm.startPrank(maker);
        tokenA.approve(address(AQUA), type(uint256).max);
        tokenB.approve(address(AQUA), type(uint256).max);
        AQUA.ship(address(router), abi.encode(order),
            dynamic([address(tokenA), address(tokenB)]), dynamic([BAL, BAL]));
        vm.stopPrank();
    }

    function _swap(ISwapVM.Order memory order, address who) internal returns (uint256 amountOut) {
        deal(address(tokenB), who, SWAP_AMOUNT);
        vm.startPrank(who);
        tokenB.approve(address(router), type(uint256).max);
        (, amountOut,) = router.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(who));
        vm.stopPrank();
    }

    // ===== keempatnya harus benar-benar melayani swap =====

    function test_Santai_Melayani() public {
        ISwapVM.Order memory o = _order(_santai(1));
        _ship(o);
        assertGt(_swap(o, taker), 0, "santai harus melayani swap");
    }

    function test_Terkonsentrasi_Melayani() public {
        ISwapVM.Order memory o = _order(_terkonsentrasi(2));
        _ship(o);
        assertGt(_swap(o, taker), 0, "terkonsentrasi harus melayani swap");
    }

    function test_AntiArbitrase_Melayani() public {
        ISwapVM.Order memory o = _order(_antiArbitrase(3));
        _ship(o);
        assertGt(_swap(o, taker), 0, "anti-arbitrase harus melayani swap");
    }

    function test_MejaPrivat_HanyaPenyalurYangDisebut() public {
        ISwapVM.Order memory o = _order(_mejaPrivat(taker, 4));
        _ship(o);
        assertGt(_swap(o, taker), 0, "penyalur yang disebut harus bisa mengisi");

        ISwapVM.Order memory o2 = _order(_mejaPrivat(taker, 5));
        _ship(o2);
        deal(address(tokenB), outsider, SWAP_AMOUNT);
        vm.startPrank(outsider);
        tokenB.approve(address(router), type(uint256).max);
        vm.expectRevert();
        router.swap(o2, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(outsider));
        vm.stopPrank();
    }

    /// @notice Inti jualan opsi terkonsentrasi: modal yang sama, keluaran lebih baik.
    ///
    /// @dev Kalau ini tidak terbukti, opsinya tidak layak ditawarkan — pengguna
    ///   mengambil risiko keluar-pita tanpa imbalan apa pun.
    function test_Terkonsentrasi_LebihEfisienDariRentangPenuh() public {
        ISwapVM.Order memory penuh = _order(_santai(10));
        _ship(penuh);
        uint256 outPenuh = _swap(penuh, taker);

        ISwapVM.Order memory pita = _order(_terkonsentrasi(11));
        _ship(pita);
        uint256 outPita = _swap(pita, taker);

        assertGt(outPita, outPenuh, "pita sempit harus memberi harga lebih baik pada modal yang sama");
    }

    /// @notice Menaruh guard SESUDAH concentrate menghapus keuntungan konsentrasi.
    ///
    /// @dev Ini penjaga regresi untuk kesalahan yang tidak menimbulkan gejala
    ///   apa pun: tidak ada revert, tidak ada angka aneh di layar, posisinya
    ///   tetap melayani swap. Yang hilang cuma alasan memilih strategi itu.
    function test_GuardHarusSebelumInstruksiPembentukSaldo() public {
        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory salahUrutan = bytes.concat(
            p.build(XYCConcentrate._xycConcentrateGrowLiquidity2D,
                XYCConcentrateArgsBuilder.build2D(Math.sqrt(0.5e36), Math.sqrt(2.0e36))),
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint64(30)))
        );
        ISwapVM.Order memory salah = _order(salahUrutan);
        _ship(salah);
        uint256 outSalah = _swap(salah, taker);

        ISwapVM.Order memory benar = _order(_terkonsentrasi(31));
        _ship(benar);
        uint256 outBenar = _swap(benar, taker);

        assertGt(outBenar, outSalah, "guard di depan harus mempertahankan efek konsentrasi");
    }

    /// @notice Memindahkan guard ke depan tidak boleh membuatnya jadi pajangan.
    function test_Terkonsentrasi_GuardTetapBekerjaSaatJaminanMenipis() public {
        ISwapVM.Order memory penuh = _order(_terkonsentrasi(40));
        _ship(penuh);
        uint256 outTerjamin = _swap(penuh, taker);

        ISwapVM.Order memory tipis = _order(_terkonsentrasi(41));
        _ship(tipis);
        // Maker membelanjakan sebagian besar tokenA-nya; Aqua masih mencatat
        // alokasi penuh, tapi jaminan nyatanya tinggal sedikit.
        vm.prank(maker);
        tokenA.transfer(outsider, (BAL * 9) / 10);

        uint256 outTipis = _swap(tipis, taker);
        assertLt(outTipis, outTerjamin, "jaminan menipis harus memperburuk harga");
        assertGt(outTipis, 0, "tapi swap wajar tetap harus terlayani");
    }

    /// @notice Keempatnya harus benar-benar memungut, bukan cuma melayani.
    function test_KeempatnyaMemungutFee() public {
        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory tanpaFee = bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint64(20)))
        );
        ISwapVM.Order memory acuan = _order(tanpaFee);
        _ship(acuan);
        uint256 outTanpaFee = _swap(acuan, taker);

        ISwapVM.Order memory santai = _order(_santai(21));
        _ship(santai);
        assertLt(_swap(santai, taker), outTanpaFee, "santai harus memungut");

        ISwapVM.Order memory decay = _order(_antiArbitrase(22));
        _ship(decay);
        assertLt(_swap(decay, taker), outTanpaFee, "anti-arbitrase harus memungut");

        ISwapVM.Order memory privat = _order(_mejaPrivat(taker, 23));
        _ship(privat);
        assertLt(_swap(privat, taker), outTanpaFee, "meja privat harus memungut");
    }
}
