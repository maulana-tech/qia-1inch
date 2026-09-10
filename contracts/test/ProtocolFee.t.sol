// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";

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

/// @notice Model bisnisnya: aplikasi dibayar tepat saat penggunanya dibayar.
///
/// @dev Bukan langganan, bukan biaya penarikan, bukan mengunci dana. Satu
///   instruksi di dalam program yang sama memotong sebagian masukan dan
///   mengirimkannya ke treasury, di transaksi swap yang sama. Kalau tidak ada
///   yang menukar, aplikasi tidak dapat apa-apa — persis seperti makernya.
///
///   Semuanya terbaca di bytecode posisi. Tidak ada kepercayaan tambahan yang
///   diminta dari pengguna: mereka bisa membongkar programnya sendiri dan
///   melihat berapa yang diambil dan ke mana.
contract ProtocolFeeTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    IqiaSwapVMRouter public router;
    TokenMock public weth;
    TokenMock public usdc;

    address public maker;
    address public taker;
    address public treasury;

    uint256 constant BAL_WETH = 10e18;
    uint256 constant BAL_USDC = 35_000e18;
    uint256 constant SWAP_IN = 1_000e18;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant MAKER_FEE_BPS = 0.0025e9; // 0,25% untuk maker
    uint32 constant PROTOCOL_BPS = 0.0005e9; // 0,05% untuk treasury

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        maker = vm.addr(0xA1);
        taker = vm.addr(0xB2);
        treasury = vm.addr(0x7EA);
        weth = new TokenMock("Wrapped Ether", "WETH");
        usdc = new TokenMock("USD Coin", "USDC");
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this));

        deal(address(weth), maker, BAL_WETH);
        deal(address(usdc), maker, BAL_USDC);
        vm.startPrank(maker);
        weth.approve(address(AQUA), type(uint256).max);
        usdc.approve(address(AQUA), type(uint256).max);
        vm.stopPrank();
    }

    function _program(bool withProtocol, uint64 saltValue) internal view returns (bytes memory) {
        return _program(withProtocol, true, saltValue);
    }

    /// @dev `withGuard` bisa dimatikan supaya efek fee bisa diukur terpisah:
    ///   `SolvencyGuard` membaca saldo dan izin maker yang SUNGGUHAN, jadi tes
    ///   yang mencabut izin akan menggerakkan guard-nya juga kalau ia terpasang.
    function _program(bool withProtocol, bool withGuard, uint64 saltValue) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            withGuard
                ? p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS))
                : bytes(""),
            withProtocol
                ? p.build(
                    Fee._aquaProtocolFeeAmountInXD,
                    FeeArgsBuilder.buildProtocolFee(PROTOCOL_BPS, treasury)
                )
                : bytes(""),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(MAKER_FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(saltValue))
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

    function _ship(bytes memory prog) internal returns (ISwapVM.Order memory o) {
        o = _order(prog);
        vm.prank(maker);
        AQUA.ship(address(router), abi.encode(o),
            dynamic([address(weth), address(usdc)]), dynamic([BAL_WETH, BAL_USDC]));
    }

    /// @dev Dipisah dari `_swap` supaya `vm.expectEmit` bisa dipasang tepat
    ///   sebelum `router.swap`, bukan menangkap `Approval` dari persiapan ini.
    function _fundTaker() internal {
        deal(address(usdc), taker, SWAP_IN);
        vm.prank(taker);
        usdc.approve(address(router), type(uint256).max);
    }

    function _swap(ISwapVM.Order memory o) internal returns (uint256 amountOut) {
        _fundTaker();
        vm.prank(taker);
        (, amountOut,) = router.swap(o, address(usdc), address(weth), SWAP_IN, _takerData());
    }

    function _shipAndSwap(bytes memory prog) internal returns (uint256 amountOut) {
        amountOut = _swap(_ship(prog));
    }

    /// @notice Treasury menerima tepat 0,05% dari masukan, di swap yang sama.
    function test_TreasuryDibayarDiSwapYangSama() public {
        assertEq(usdc.balanceOf(treasury), 0, "treasury mulai dari nol");

        _shipAndSwap(_program(true, 1));

        uint256 diterima = usdc.balanceOf(treasury);
        uint256 diharapkan = (SWAP_IN * PROTOCOL_BPS) / 1e9;
        assertEq(diterima, diharapkan, "treasury menerima 0,05% dari masukan");
        assertGt(diterima, 0, "dan jumlahnya bukan nol");
    }

    /// @notice Tanpa instruksi itu, treasury tidak menerima apa pun.
    ///
    /// @dev Terdengar sepele, tapi inilah yang membedakan model bisnis yang
    ///   tertulis di bytecode dari yang cuma dijanjikan di dokumen: kalau
    ///   instruksinya tidak ada, uangnya memang tidak mengalir.
    function test_TanpaInstruksiTreasuryTidakDapatApaPun() public {
        _shipAndSwap(_program(false, 2));
        assertEq(usdc.balanceOf(treasury), 0, "tidak ada instruksi, tidak ada aliran");
    }

    /// @notice Fee protokol mengurangi hasil penukar, bukan mencuri dari maker.
    ///
    /// @dev Dua-duanya dipotong dari MASUKAN sebelum kurva, jadi yang berkurang
    ///   adalah keluaran untuk penukar. Maker tetap menerima seluruh masukan
    ///   dikurangi bagian treasury.
    function test_MakerTetapMenerimaSisanya() public {
        uint256 sebelum = usdc.balanceOf(maker);
        _shipAndSwap(_program(true, 3));

        uint256 keTreasury = usdc.balanceOf(treasury);
        uint256 keMaker = usdc.balanceOf(maker) - sebelum;

        assertEq(keMaker + keTreasury, SWAP_IN, "seluruh masukan terbagi habis, tanpa sisa");
        assertGt(keMaker, keTreasury * 10, "bagian maker jauh lebih besar");
    }

    /// @notice Harga yang dikutip sama dengan yang benar-benar dieksekusi.
    ///
    /// @dev Invarian #3 SwapVM ("Quote/Swap Consistency"), diuji dengan instruksi
    ///   fee terpasang. Halaman Swap menaruh `minAmountOut` di atas angka kutipan
    ///   ini, jadi kalau kutipan dan eksekusi berbeda, batas slippage-nya
    ///   berbohong dan pengguna kena tanpa sebab yang terlihat.
    ///
    ///   Fee protokol punya satu divergensi yang didokumentasikan hulu: di mode
    ///   kutipan (`isStaticContext`) tarikan ke treasury dilewati, tapi
    ///   ANGKA-nya tetap dihitung. Jadi jumlahnya harus identik — dan itu yang
    ///   dipatok di sini.
    function test_KutipanSamaDenganEksekusi() public {
        ISwapVM.Order memory o = _ship(_program(true, 4));

        (, uint256 dikutip,) = router.quote(o, address(usdc), address(weth), SWAP_IN, _takerData());
        uint256 diterima = _swap(o);

        assertEq(diterima, dikutip, "kutipan harus sama persis dengan eksekusi");
        assertGt(dikutip, 0, "dan bukan nol");
    }

    /// @notice Kalau maker tidak sanggup menutup fee, swap TETAP jalan dan
    ///   treasury tidak dapat apa-apa.
    ///
    /// @dev Ini batas model bisnisnya, dan ditulis di sini supaya tidak ada yang
    ///   menganggap pendapatannya terjamin. `_aquaProtocolFeeAmountInXD` memungut
    ///   secara BEST-EFFORT: tarikan gagal ditangkap `try/catch`, dilaporkan lewat
    ///   `ProtocolFeeSkipped`, lalu swap-nya diteruskan seolah tidak ada fee.
    ///
    ///   Kenapa penting: fee ditarik dari saldo Aqua maker untuk `tokenIn` yang
    ///   SUDAH ADA sebelum swap — bukan dari uang penukar yang baru masuk. Posisi
    ///   tabungan satu sisi (pengguna hanya menyetor WETH, tanpa USDC) karena itu
    ///   tidak menghasilkan apa pun untuk treasury pada arah USDC→WETH, justru
    ///   arah yang paling sering dipakai. Yang mengukur pendapatan harus membaca
    ///   `Pulled` ke treasury, bukan mengalikan volume dengan tarif.
    function test_FeeDilewatiKalauMakerTidakSanggup() public {
        ISwapVM.Order memory o = _ship(_program(true, false, 5));
        _fundTaker();

        // Maker menarik izin USDC-nya. Saldo virtualnya tidak berubah, jadi kurva
        // dan seluruh sisa swap identik — yang gagal hanya tarikan fee.
        vm.prank(maker);
        usdc.approve(address(AQUA), 0);

        // Log direkam, bukan `expectEmit`: instruksi fee memancarkan di tengah
        // `runLoop`, di antara `Pulled`/`Pushed` Aqua dan `Swapped` router, jadi
        // menuntut ia jadi event BERIKUTNYA cuma memancing tes yang rapuh.
        vm.recordLogs();
        vm.prank(taker);
        (, uint256 diterima,) = router.swap(o, address(usdc), address(weth), SWAP_IN, _takerData());

        assertGt(diterima, 0, "swap tetap berhasil");
        assertEq(usdc.balanceOf(treasury), 0, "treasury tidak dapat apa-apa");

        uint256 fee = (SWAP_IN * PROTOCOL_BPS) / 1e9;
        assertTrue(_skipDilaporkan(vm.getRecordedLogs(), fee), "kelewatannya dilaporkan, bukan senyap");
    }

    /// @notice Fee yang dilewati tidak menggeser angka yang diterima penukar.
    ///
    /// @dev Ini yang membuat `minAmountOut` di halaman Swap tetap bisa dipercaya:
    ///   `quote()` selalu menghitung seolah fee tertarik, dan angka itu tetap
    ///   benar walaupun tarikannya nanti gagal. Potongan pada masukan terjadi di
    ///   `_feeAmountIn` tanpa bergantung pada berhasil-tidaknya tarikan, jadi yang
    ///   berubah cuma siapa yang memegang selisihnya — treasury atau maker.
    ///
    ///   Diukur TANPA `SolvencyGuard`, dan itu bukan detail: dengan guard
    ///   terpasang, keluarannya memang bergeser (276594915768062469 →
    ///   276967862704952402) — tapi bukan karena fee-nya, melainkan karena guard
    ///   membaca izin maker yang sungguhan, dan tes ini mencabut izin itu. Dua
    ///   sebab yang kebetulan bergerak bersamaan; dipisahkan supaya angkanya
    ///   berarti.
    function test_FeeYangDilewatiTidakMenggeserKeluaran() public {
        ISwapVM.Order memory ditarik = _ship(_program(true, false, 6));
        (, uint256 dikutip,) = router.quote(ditarik, address(usdc), address(weth), SWAP_IN, _takerData());
        uint256 dengan = _swap(ditarik);
        assertEq(dengan, dikutip, "saat tarikan berhasil, kutipan tepat");

        ISwapVM.Order memory o = _ship(_program(true, false, 7));
        vm.prank(maker);
        usdc.approve(address(AQUA), 0);

        assertEq(_swap(o), dengan, "keluaran penukar sama, fee tertarik atau tidak");
    }

    /// @dev Mencari `ProtocolFeeSkipped` di antara log sebuah transaksi.
    function _skipDilaporkan(Vm.Log[] memory logs, uint256 fee) private view returns (bool) {
        bytes32 topic = keccak256("ProtocolFeeSkipped(bytes32,address,address,uint256)");
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics.length == 0 || logs[i].topics[0] != topic) continue;
            (, address token, address to, uint256 amount) =
                abi.decode(logs[i].data, (bytes32, address, address, uint256));
            if (token == address(usdc) && to == treasury && amount == fee) return true;
        }
        return false;
    }
}