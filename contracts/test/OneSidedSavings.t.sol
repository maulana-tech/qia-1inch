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

/// @notice Posisi tabungan satu sisi TIDAK BISA MELAYANI SATU SWAP PUN.
///
/// @dev Halaman Savings mengizinkannya hari ini: syaratnya
///   `split[0] > 0 || split[1] > 0`. Pengguna yang dompetnya cuma berisi WETH
///   bisa menekan "Start" dan mendapat posisi dengan sisi USDC nol.
///
///   Yang dikhawatirkan pertama kali: kurva `x·y=k` menghitung keluaran sebagai
///   `balanceOut * amountIn / (balanceIn + amountIn)`, dan dengan `balanceIn = 0`
///   suku itu menjadi `balanceOut * amountIn / amountIn` — seluruh sisi keluaran
///   untuk masukan seberapa pun. Ternyata TIDAK: `XYCSwap` menolak lebih dulu
///   dengan `XYCSwapRequiresBothBalancesNonZero`. Kurasnya mustahil.
///
///   Tapi akibatnya tetap buruk, cuma bentuknya lain: posisinya terlihat hidup
///   di setiap layar, saldonya terdaftar, dan SETIAP swap gagal. Penggunanya
///   menunggu penghasilan yang tidak akan pernah datang, tanpa satu pun tanda
///   ada yang salah. Perbaikannya di sisi UI — buka hanya kalau KEDUA sisi
///   terisi — dan test ini yang menjelaskan kenapa syarat itu ada.
contract OneSidedSavingsTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();
    IqiaSwapVMRouter public router;
    TokenMock public weth;
    TokenMock public usdc;
    address public maker;
    address public taker;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.0025e9;

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        maker = vm.addr(0xA1);
        taker = vm.addr(0xB2);
        weth = new TokenMock("Wrapped Ether", "WETH");
        usdc = new TokenMock("USD Coin", "USDC");
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this));
        deal(address(weth), maker, 10e18);
        vm.startPrank(maker);
        weth.approve(address(AQUA), type(uint256).max);
        usdc.approve(address(AQUA), type(uint256).max);
        vm.stopPrank();
    }

    function _program(uint64 s) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(s))
        );
    }

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

    /// @notice Posisi satu sisi menolak setiap swap, bukan menguras.
    function test_SatuSisiMenolakSetiapSwap() public {
        ISwapVM.Order memory o = _order(_program(1));
        vm.prank(maker);
        // 10 WETH terdaftar, sisi USDC NOL — persis yang dihasilkan halaman
        // Savings kalau dompet penggunanya cuma berisi WETH.
        AQUA.ship(
            address(router),
            abi.encode(o),
            dynamic([address(weth), address(usdc)]),
            dynamic([uint256(10e18), uint256(0)])
        );

        uint256 tiny = 1e18; // satu USDC saja
        deal(address(usdc), taker, tiny);
        vm.startPrank(taker);
        usdc.approve(address(router), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSignature("XYCSwapRequiresBothBalancesNonZero(uint256,uint256)", 0, 10e18)
        );
        router.swap(o, address(usdc), address(weth), tiny, _takerData());
        vm.stopPrank();
    }

    /// @notice Pembanding: posisi dua sisi yang seimbang, masukan yang sama.
    function test_PembandingDuaSisi() public {
        deal(address(usdc), maker, 35_000e18);
        ISwapVM.Order memory o = _order(_program(2));
        vm.prank(maker);
        AQUA.ship(
            address(router),
            abi.encode(o),
            dynamic([address(weth), address(usdc)]),
            dynamic([uint256(10e18), uint256(35_000e18)])
        );

        uint256 tiny = 1e18;
        deal(address(usdc), taker, tiny);
        vm.startPrank(taker);
        usdc.approve(address(router), type(uint256).max);
        (, uint256 keluar,) = router.swap(o, address(usdc), address(weth), tiny, _takerData());
        vm.stopPrank();

        emit log_named_decimal_uint("keluar WETH (dua sisi)", keluar, 18);
    }
}
