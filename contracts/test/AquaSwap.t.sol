// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import { AquaOpcodesDebug } from "@1inch/swap-vm/src/opcodes/AquaOpcodesDebug.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";

import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";
import { MockTaker } from "@1inch/swap-vm/test/mocks/MockTaker.sol";

/// @notice Test pertama integrasi Aqua + SwapVM.
///
/// Ini bukan test fitur Iqia. Tujuannya membuktikan satu hal: kontrak Aqua dan
/// SwapVM resmi benar-benar terpasang, terkompilasi, dan bisa menjalankan swap
/// yang memindahkan token sungguhan.
///
/// Yang dibuktikan:
///   1. Maker cukup memberi izin sekali, lalu ship() mencatat saldo virtual
///      TANPA memindahkan token — saldo dompetnya tetap utuh
///   2. Swap menarik token dari dompet maker langsung ke taker
///   3. Harga mengikuti kurva x*y=k dari program bytecode, bukan kode Solidity
contract AquaSwapTest is Test, AquaOpcodesDebug {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    AquaSwapVMRouter public router;
    TokenMock public tokenA;
    TokenMock public tokenB;
    MockTaker public taker;

    address public maker;

    uint256 constant MAKER_BALANCE_A = 100e18;
    uint256 constant MAKER_BALANCE_B = 200e18;
    uint256 constant SWAP_AMOUNT = 50e18;

    constructor() AquaOpcodesDebug(address(AQUA)) { }

    function setUp() public {
        maker = vm.addr(0x1234);

        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");

        router = new AquaSwapVMRouter(address(AQUA), address(0), address(this), "IqiaSwapVM", "1.0.0");
        taker = new MockTaker(AQUA, router, address(this));
    }

    /// @dev Program paling sederhana: satu instruksi kurva x*y=k, plus salt agar
    ///      strategyHash unik antar test. Salt tidak mempengaruhi perhitungan.
    function _buildProgram() internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint256(1)))
        );
    }

    function _createOrder(bytes memory program) internal view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: maker,
            receiver: address(0),
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true, // saldo dari Aqua, tanpa tanda tangan
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

    function _takerData(bool isExactIn) internal view returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(taker),
            isExactIn: isExactIn,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: false,
            threshold: "",
            to: address(0),
            deadline: 0,
            hasPreTransferInCallback: true, // taker membayar lewat callback
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

    /// @dev Maker memberi izin sekali, lalu ship() mencatat saldo virtual.
    function _shipStrategy(ISwapVM.Order memory order) internal returns (bytes32) {
        vm.startPrank(maker);
        tokenA.approve(address(AQUA), type(uint256).max);
        tokenB.approve(address(AQUA), type(uint256).max);
        bytes32 strategyHash = AQUA.ship(
            address(router),
            abi.encode(order),
            dynamic([address(tokenA), address(tokenB)]),
            dynamic([MAKER_BALANCE_A, MAKER_BALANCE_B])
        );
        vm.stopPrank();
        return strategyHash;
    }

    // -----------------------------------------------------------------------

    /// @notice ship() mencatat izin tanpa memindahkan satu token pun.
    function test_ShipMovesNoTokens() public {
        tokenA.mint(maker, MAKER_BALANCE_A);
        tokenB.mint(maker, MAKER_BALANCE_B);

        ISwapVM.Order memory order = _createOrder(_buildProgram());
        bytes32 strategyHash = _shipStrategy(order);

        assertEq(strategyHash, router.hash(order), "strategyHash harus sama dengan orderHash");

        // Inti Aqua: token tidak ke mana-mana.
        assertEq(tokenA.balanceOf(maker), MAKER_BALANCE_A, "saldo maker tidak boleh berkurang");
        assertEq(tokenB.balanceOf(maker), MAKER_BALANCE_B, "saldo maker tidak boleh berkurang");
        assertEq(tokenA.balanceOf(address(AQUA)), 0, "Aqua tidak menahan token");
        assertEq(tokenB.balanceOf(address(AQUA)), 0, "Aqua tidak menahan token");

        (uint256 balA, uint256 balB) =
            AQUA.safeBalances(maker, address(router), strategyHash, address(tokenA), address(tokenB));
        assertEq(balA, MAKER_BALANCE_A, "saldo virtual tokenA");
        assertEq(balB, MAKER_BALANCE_B, "saldo virtual tokenB");
    }

    /// @notice Swap memindahkan token sungguhan, dengan harga dari kurva x*y=k.
    function test_SwapMovesRealTokens() public {
        tokenA.mint(maker, MAKER_BALANCE_A);
        tokenB.mint(maker, MAKER_BALANCE_B);
        tokenB.mint(address(taker), SWAP_AMOUNT);

        ISwapVM.Order memory order = _createOrder(_buildProgram());
        _shipStrategy(order);

        // Taker menyerahkan tokenB, menerima tokenA.
        // x*y=k: out = (in * balanceOut) / (balanceIn + in)
        uint256 expectedOut = (SWAP_AMOUNT * MAKER_BALANCE_A) / (MAKER_BALANCE_B + SWAP_AMOUNT);

        (uint256 amountIn, uint256 amountOut) = taker.swap(
            order, address(tokenB), address(tokenA), SWAP_AMOUNT, _takerData(true)
        );

        assertEq(amountIn, SWAP_AMOUNT, "amountIn");
        assertEq(amountOut, expectedOut, "amountOut mengikuti kurva x*y=k");
        assertEq(expectedOut, 20e18, "50 * 100 / 250 = 20");

        // Transfer token yang benar-benar terjadi.
        assertEq(tokenA.balanceOf(address(taker)), expectedOut, "taker menerima tokenA");
        assertEq(tokenB.balanceOf(address(taker)), 0, "taker menyerahkan seluruh tokenB");
        assertEq(tokenA.balanceOf(maker), MAKER_BALANCE_A - expectedOut, "tokenA keluar dari dompet maker");
        assertEq(tokenB.balanceOf(maker), MAKER_BALANCE_B + SWAP_AMOUNT, "tokenB masuk ke dompet maker");

        // Aqua tetap tidak menahan apa pun sepanjang alur.
        assertEq(tokenA.balanceOf(address(AQUA)), 0, "Aqua tidak menahan token");
        assertEq(tokenB.balanceOf(address(AQUA)), 0, "Aqua tidak menahan token");
    }

    /// @notice quote() harus mengembalikan angka yang sama persis dengan swap().
    function test_QuoteMatchesSwap() public {
        tokenA.mint(maker, MAKER_BALANCE_A);
        tokenB.mint(maker, MAKER_BALANCE_B);
        tokenB.mint(address(taker), SWAP_AMOUNT);

        ISwapVM.Order memory order = _createOrder(_buildProgram());
        _shipStrategy(order);

        bytes memory takerData = _takerData(true);

        (uint256 quotedIn, uint256 quotedOut,) =
            router.quote(order, address(tokenB), address(tokenA), SWAP_AMOUNT, takerData);

        (uint256 swappedIn, uint256 swappedOut) =
            taker.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, takerData);

        assertEq(swappedIn, quotedIn, "amountIn quote harus sama dengan swap");
        assertEq(swappedOut, quotedOut, "amountOut quote harus sama dengan swap");
    }
}
