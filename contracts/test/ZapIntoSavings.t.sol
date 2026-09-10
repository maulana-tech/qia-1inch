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

/// @notice Alur konsumen: masuk memegang SATU token, keluar jadi market maker.
///
/// @dev Ini yang dikerjakan `zapAndOpen` di frontend, diuji ujung-ke-ujung di
///   rantai. Urutannya: tukar separuh lewat posisi meja, lalu kirim posisi
///   sendiri dengan kedua sisi.
///
///   Yang benar-benar dibuktikan di sini bukan "transaksinya berhasil" —
///   melainkan bahwa posisi yang lahir dari alur itu BISA MELAYANI SWAP. Posisi
///   satu sisi juga "berhasil" dikirim; ia cuma tidak pernah berguna. Bedanya
///   baru terlihat saat ada orang ketiga yang mencoba menukar lewatnya, dan
///   itulah assertion terakhir di bawah.
contract ZapIntoSavingsTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();
    IqiaSwapVMRouter public router;
    TokenMock public weth;
    TokenMock public usdc;

    /// @dev Meja yang sudah ada — lawan tukar untuk langkah pertama.
    address public desk;
    /// @dev Konsumen kita. Dompetnya HANYA berisi USDC.
    address public consumer;
    /// @dev Orang ketiga yang nanti menukar lewat posisi konsumen.
    address public passerby;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.0025e9;

    uint256 constant DESK_WETH = 10e18;
    uint256 constant DESK_USDC = 35_000e18;
    uint256 constant CONSUMER_USDC = 1_000e18;
    /// @dev Bagian yang disisihkan, seperti slider 20% di halaman Savings.
    uint256 constant PERCENT = 20;

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        desk = vm.addr(0xD1);
        consumer = vm.addr(0xC0);
        passerby = vm.addr(0xB2);

        weth = new TokenMock("Wrapped Ether", "WETH");
        usdc = new TokenMock("USD Coin", "USDC");
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this));

        deal(address(weth), desk, DESK_WETH);
        deal(address(usdc), desk, DESK_USDC);
        vm.startPrank(desk);
        weth.approve(address(AQUA), type(uint256).max);
        usdc.approve(address(AQUA), type(uint256).max);
        vm.stopPrank();

        // Konsumen: USDC saja. Nol WETH — itu inti kasusnya.
        deal(address(usdc), consumer, CONSUMER_USDC);
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

    function _order(address maker, bytes memory prog) internal pure returns (ISwapVM.Order memory) {
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

    function _takerData(address t) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: t, isExactIn: true, shouldUnwrapWeth: false,
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

    /// @notice Masuk dengan USDC saja, keluar dengan posisi yang benar-benar melayani.
    function test_KonsumenSatuTokenBerakhirPunyaPosisiYangHidup() public {
        // --- meja yang sudah ada, jadi lawan tukar -------------------------
        ISwapVM.Order memory deskOrder = _order(desk, _program(1));
        vm.prank(desk);
        AQUA.ship(
            address(router),
            abi.encode(deskOrder),
            dynamic([address(weth), address(usdc)]),
            dynamic([DESK_WETH, DESK_USDC])
        );

        // --- langkah 1: tukar separuh dari yang disisihkan ------------------
        uint256 aside = (CONSUMER_USDC * PERCENT) / 100;
        uint256 toSwap = aside / 2;

        vm.startPrank(consumer);
        usdc.approve(address(router), type(uint256).max);
        (, uint256 gotWeth,) =
            router.swap(deskOrder, address(usdc), address(weth), toSwap, _takerData(consumer));
        vm.stopPrank();

        assertGt(gotWeth, 0, "tukar penyeimbang harus menghasilkan WETH");
        assertEq(weth.balanceOf(consumer), gotWeth, "WETH-nya mendarat di dompet konsumen");

        // --- langkah 2: kirim posisinya sendiri, dua sisi -------------------
        uint256 shipUsdc = aside - toSwap;
        ISwapVM.Order memory mine = _order(consumer, _program(2));

        vm.startPrank(consumer);
        weth.approve(address(AQUA), type(uint256).max);
        usdc.approve(address(AQUA), type(uint256).max);
        uint256 sebelumUsdc = usdc.balanceOf(consumer);
        uint256 sebelumWeth = weth.balanceOf(consumer);
        AQUA.ship(
            address(router),
            abi.encode(mine),
            dynamic([address(weth), address(usdc)]),
            dynamic([gotWeth, shipUsdc])
        );
        vm.stopPrank();

        // Inti Aqua, diperiksa di alur konsumen dan bukan cuma di tes unit.
        assertEq(usdc.balanceOf(consumer), sebelumUsdc, "ship tidak memindahkan USDC");
        assertEq(weth.balanceOf(consumer), sebelumWeth, "ship tidak memindahkan WETH");

        // --- yang sebenarnya dibuktikan: posisinya MELAYANI -----------------
        //
        // Posisi satu sisi juga akan lolos sampai baris ini. Yang membedakan
        // cuma langkah berikut.
        uint256 mampir = 5e18;
        deal(address(usdc), passerby, mampir);
        vm.startPrank(passerby);
        usdc.approve(address(router), type(uint256).max);
        (, uint256 keluar,) =
            router.swap(mine, address(usdc), address(weth), mampir, _takerData(passerby));
        vm.stopPrank();

        assertGt(keluar, 0, "posisi konsumen harus benar-benar bisa ditukar");
        emit log_named_decimal_uint("USDC disisihkan", aside, 18);
        emit log_named_decimal_uint("  ditukar jadi WETH", gotWeth, 18);
        emit log_named_decimal_uint("  sisa USDC dikirim", shipUsdc, 18);
        emit log_named_decimal_uint("orang ketiga menukar 5 USDC, dapat WETH", keluar, 18);
    }

    /// @notice Pembanding tanpa zap: posisi satu sisi lolos dikirim, lalu mati.
    ///
    /// @dev Dua tes ini berpasangan. Yang di atas berakhir dengan swap yang
    ///   berhasil; yang ini dengan revert. Bedanya cuma satu langkah tukar.
    function test_TanpaZapPosisinyaLolosDikirimTapiMati() public {
        uint256 aside = (CONSUMER_USDC * PERCENT) / 100;
        ISwapVM.Order memory mine = _order(consumer, _program(3));

        vm.startPrank(consumer);
        usdc.approve(address(AQUA), type(uint256).max);
        AQUA.ship(
            address(router),
            abi.encode(mine),
            dynamic([address(weth), address(usdc)]),
            dynamic([uint256(0), aside])
        );
        vm.stopPrank();

        uint256 mampir = 5e18;
        deal(address(usdc), passerby, mampir);
        vm.startPrank(passerby);
        usdc.approve(address(router), type(uint256).max);
        // Sisi masuk (USDC) terisi, sisi keluar (WETH) nol — dan justru sisi
        // keluar yang tidak ada isinya untuk diserahkan.
        vm.expectRevert(
            abi.encodeWithSignature("XYCSwapRequiresBothBalancesNonZero(uint256,uint256)", aside, 0)
        );
        router.swap(mine, address(usdc), address(weth), mampir, _takerData(passerby));
        vm.stopPrank();
    }
}
