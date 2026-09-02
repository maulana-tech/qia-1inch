// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";
import { MockTaker } from "@1inch/swap-vm/test/mocks/MockTaker.sol";

import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { ExclusiveFill, ExclusiveFillArgsBuilder } from "../src/iqia/instructions/ExclusiveFill.sol";
import { SolvencyGuard, SolvencyGuardArgsBuilder } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Dua opcode custom Iqia, diuji terhadap kontrak Aqua dan SwapVM resmi.
contract IqiaOpcodesTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    IqiaSwapVMRouter public router;
    TokenMock public tokenA;
    TokenMock public tokenB;

    /// @dev Taker yang ditunjuk — satu-satunya yang berhak mengisi.
    MockTaker public desk;
    /// @dev Taker lain, mewakili bot publik.
    MockTaker public outsider;

    address public maker;

    uint256 constant VIRTUAL_A = 100e18;
    uint256 constant VIRTUAL_B = 200e18;
    uint256 constant SWAP_AMOUNT = 50e18;
    uint32 constant MAX_SURCHARGE_BPS = 0.1e9; // 10% saat sandaran nol

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        maker = vm.addr(0x1234);
        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this), "IqiaSwapVM", "1.0.0");
        desk = new MockTaker(AQUA, router, address(this));
        outsider = new MockTaker(AQUA, router, address(this));
    }

    // ---------------------------------------------------------------- helpers

    function _program(bool gated, uint32 surchargeBps, uint256 salt) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            gated ? p.build(ExclusiveFill._onlyExclusiveTaker, ExclusiveFillArgsBuilder.build(address(desk))) : bytes(""),
            surchargeBps > 0
                ? p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(surchargeBps))
                : bytes(""),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(salt))
        );
    }

    function _order(bytes memory program) internal view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: maker,
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
    }

    function _takerData(address taker, bool isExactIn) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: taker,
            isExactIn: isExactIn,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: false,
            threshold: "",
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
    }

    /// @dev `walletA` sengaja dipisah dari saldo virtual: Aqua.ship() tidak
    ///   mengecek dompet, jadi maker bisa menjanjikan lebih dari yang dipegangnya.
    function _ship(ISwapVM.Order memory order, uint256 walletA) internal {
        // deal() menetapkan saldo secara absolut. mint() akan menumpuk antar
        // pemanggilan, dan itu diam-diam merusak test yang mengirim beberapa
        // strategi dari maker yang sama.
        deal(address(tokenA), maker, walletA);
        deal(address(tokenB), maker, VIRTUAL_B);
        vm.startPrank(maker);
        tokenA.approve(address(AQUA), type(uint256).max);
        tokenB.approve(address(AQUA), type(uint256).max);
        AQUA.ship(
            address(router),
            abi.encode(order),
            dynamic([address(tokenA), address(tokenB)]),
            dynamic([VIRTUAL_A, VIRTUAL_B])
        );
        vm.stopPrank();
    }

    // ------------------------------------------------------------ ExclusiveFill

    function test_Gate_AllowedTakerCanFill() public {
        ISwapVM.Order memory order = _order(_program(true, 0, 1));
        _ship(order, VIRTUAL_A);
        tokenB.mint(address(desk), SWAP_AMOUNT);

        (, uint256 amountOut) =
            desk.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(address(desk), true));

        assertEq(amountOut, 20e18, "taker yang ditunjuk boleh mengisi");
    }

    function test_Gate_OutsiderIsRejected() public {
        ISwapVM.Order memory order = _order(_program(true, 0, 2));
        _ship(order, VIRTUAL_A);
        tokenB.mint(address(outsider), SWAP_AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(
                ExclusiveFill.ExclusiveFillTakerNotAllowed.selector, address(outsider), address(desk)
            )
        );
        outsider.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(address(outsider), true));
    }

    /// @dev Gerbang harus membandingkan seluruh 20 byte. `PrivateOrder` bawaan
    ///   SwapVM mencocokkan sebagian, sehingga alamat berbeda bisa ikut lolos.
    function test_Gate_RejectsNearMissAddress() public {
        ISwapVM.Order memory order = _order(_program(true, 0, 3));
        _ship(order, VIRTUAL_A);

        address nearMiss = address(uint160(address(desk)) ^ 1); // beda satu bit
        vm.deal(nearMiss, 1 ether);
        tokenB.mint(nearMiss, SWAP_AMOUNT);

        vm.prank(nearMiss);
        vm.expectRevert(
            abi.encodeWithSelector(ExclusiveFill.ExclusiveFillTakerNotAllowed.selector, nearMiss, address(desk))
        );
        router.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(nearMiss, true));
    }

    // ----------------------------------------------------------- SolvencyGuard

    function test_Solvency_FullyBackedCostsNothing() public {
        ISwapVM.Order memory guarded = _order(_program(false, MAX_SURCHARGE_BPS, 10));
        ISwapVM.Order memory plain = _order(_program(false, 0, 11));

        _ship(guarded, VIRTUAL_A); // dompet menutupi seluruh saldo virtual
        _ship(plain, VIRTUAL_A);

        tokenB.mint(address(desk), SWAP_AMOUNT * 2);

        (, uint256 guardedOut) =
            desk.swap(guarded, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(address(desk), true));
        (, uint256 plainOut) =
            desk.swap(plain, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(address(desk), true));

        assertEq(guardedOut, plainOut, "sandaran penuh: tidak ada biaya tambahan");
    }

    function test_Solvency_ThinBackingWorsensPrice() public {
        ISwapVM.Order memory order = _order(_program(false, MAX_SURCHARGE_BPS, 20));
        _ship(order, VIRTUAL_A / 2); // dompet hanya menutupi separuh
        tokenB.mint(address(desk), SWAP_AMOUNT);

        (, uint256 amountOut) =
            desk.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(address(desk), true));

        // kekurangan 50% -> tambahan 5% dari 10%
        uint256 surcharge = uint256(MAX_SURCHARGE_BPS) / 2;
        uint256 effectiveIn = SWAP_AMOUNT - ((SWAP_AMOUNT * surcharge + 1e9 - 1) / 1e9);
        uint256 expected = (effectiveIn * VIRTUAL_A) / (VIRTUAL_B + effectiveIn);

        assertEq(amountOut, expected, "harga mengikuti kekurangan sandaran");
        assertLt(amountOut, 20e18, "harus lebih buruk daripada tanpa penjaga");
    }

    /// @dev Semakin tipis sandaran, semakin buruk harganya. Monoton.
    function test_Solvency_PriceDegradesMonotonically() public {
        uint256[3] memory wallets = [VIRTUAL_A, VIRTUAL_A / 2, VIRTUAL_A / 10];
        // Kecil, supaya ketiga langkah tetap di bawah batas keras dompet dan yang
        // diuji benar-benar harganya, bukan kegagalan transfer.
        uint256 smallSwap = 2e18;
        uint256 previousOut = type(uint256).max;

        for (uint256 i = 0; i < wallets.length; i++) {
            ISwapVM.Order memory order = _order(_program(false, MAX_SURCHARGE_BPS, 30 + i));
            _ship(order, wallets[i]);
            tokenB.mint(address(desk), smallSwap);

            (, uint256 amountOut) =
                desk.swap(order, address(tokenB), address(tokenA), smallSwap, _takerData(address(desk), true));

            assertLt(amountOut, previousOut, "sandaran menipis harus memperburuk harga");
            previousOut = amountOut;
        }
    }

    /// @dev Batas kerasnya tetap ada. Kalau keluaran yang diminta melebihi isi
    ///   dompet maker, `pull()` gagal di transferFrom — tidak ada instruksi yang
    ///   bisa memunculkan token yang tidak ada. Penjaga ini menggeser titik
    ///   kegagalan, bukan menghapusnya.
    function test_Solvency_HardLimitStillApplies() public {
        ISwapVM.Order memory order = _order(_program(false, MAX_SURCHARGE_BPS, 80));
        _ship(order, VIRTUAL_A / 20); // dompet 5e18, keluaran diminta ~19e18
        tokenB.mint(address(desk), SWAP_AMOUNT);

        vm.expectRevert();
        desk.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(address(desk), true));
    }

    /// @dev Inti gagasannya: dengan sandaran tipis, swap yang MASIH MUAT tetap
    ///   terlayani — hanya lebih mahal. Bandingkan dengan perilaku tanpa penjaga,
    ///   yang memberi harga penuh sampai detik dana benar-benar habis.
    function test_Solvency_SmallSwapStillSucceedsOnThinBacking() public {
        uint256 smallSwap = 2e18;

        ISwapVM.Order memory guarded = _order(_program(false, MAX_SURCHARGE_BPS, 40));
        ISwapVM.Order memory plain = _order(_program(false, 0, 41));
        _ship(guarded, VIRTUAL_A / 20); // sandaran 5%
        _ship(plain, VIRTUAL_A / 20);
        tokenB.mint(address(desk), smallSwap * 2);

        (, uint256 guardedOut) =
            desk.swap(guarded, address(tokenB), address(tokenA), smallSwap, _takerData(address(desk), true));
        (, uint256 plainOut) =
            desk.swap(plain, address(tokenB), address(tokenA), smallSwap, _takerData(address(desk), true));

        assertGt(guardedOut, 0, "swap tetap berhasil");
        assertLt(guardedOut, plainOut, "tapi lebih mahal daripada tanpa penjaga");
    }

    function test_Solvency_NoBackingReverts() public {
        ISwapVM.Order memory order = _order(_program(false, MAX_SURCHARGE_BPS, 50));
        _ship(order, 0); // dompet kosong
        tokenB.mint(address(desk), SWAP_AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(
                SolvencyGuard.SolvencyGuardMakerHasNoBacking.selector, maker, address(tokenA)
            )
        );
        desk.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(address(desk), true));
    }

    /// @dev Izin yang dicabut sama saja dengan dompet kosong: Aqua tidak bisa menarik.
    function test_Solvency_RevokedAllowanceCountsAsNoBacking() public {
        ISwapVM.Order memory order = _order(_program(false, MAX_SURCHARGE_BPS, 60));
        _ship(order, VIRTUAL_A);

        vm.prank(maker);
        tokenA.approve(address(AQUA), 0);

        tokenB.mint(address(desk), SWAP_AMOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(
                SolvencyGuard.SolvencyGuardMakerHasNoBacking.selector, maker, address(tokenA)
            )
        );
        desk.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(address(desk), true));
    }

    // ------------------------------------------------------------- konsistensi

    function test_QuoteMatchesSwapWithBothOpcodes() public {
        ISwapVM.Order memory order = _order(_program(true, MAX_SURCHARGE_BPS, 70));
        _ship(order, VIRTUAL_A / 2);
        tokenB.mint(address(desk), SWAP_AMOUNT);

        bytes memory takerData = _takerData(address(desk), true);

        vm.prank(address(desk));
        (uint256 quotedIn, uint256 quotedOut,) =
            router.quote(order, address(tokenB), address(tokenA), SWAP_AMOUNT, takerData);

        (uint256 swappedIn, uint256 swappedOut) =
            desk.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, takerData);

        assertEq(swappedIn, quotedIn, "amountIn quote harus sama dengan swap");
        assertEq(swappedOut, quotedOut, "amountOut quote harus sama dengan swap");
    }
}
