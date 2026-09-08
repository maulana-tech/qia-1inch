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
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
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

    function _shipAndSwap(bytes memory prog) internal returns (uint256 amountOut) {
        ISwapVM.Order memory o = _order(prog);
        vm.prank(maker);
        AQUA.ship(address(router), abi.encode(o),
            dynamic([address(weth), address(usdc)]), dynamic([BAL_WETH, BAL_USDC]));

        deal(address(usdc), taker, SWAP_IN);
        vm.startPrank(taker);
        usdc.approve(address(router), type(uint256).max);
        (, amountOut,) = router.swap(o, address(usdc), address(weth), SWAP_IN, _takerData());
        vm.stopPrank();
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
}
