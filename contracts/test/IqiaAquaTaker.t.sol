// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";

import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { IqiaAquaTaker } from "../src/iqia/IqiaAquaTaker.sol";
import { ShieldedGate, ShieldedGateArgsBuilder } from "../src/iqia/instructions/ShieldedGate.sol";

/// @notice Alur lengkap: kolam terlindung berdagang lewat perantara, ke likuiditas
///   yang tidak pernah meninggalkan dompet market maker.
contract IqiaAquaTakerTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    IqiaSwapVMRouter public router;
    IqiaAquaTaker public adapter;
    TokenMock public tokenA;
    TokenMock public tokenB;

    /// @dev Berdiri mewakili IqiaPool: alamat yang memegang dana pengguna.
    address public pool;
    address public maker;
    address public outsider;

    uint256 constant VIRTUAL_A = 100e18;
    uint256 constant VIRTUAL_B = 200e18;
    uint256 constant SWAP_AMOUNT = 50e18;

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        pool = vm.addr(0xB00F);
        maker = vm.addr(0x1234);
        outsider = vm.addr(0xBAD);

        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");

        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this), "IqiaSwapVM", "1.0.0");
        adapter = new IqiaAquaTaker(IAqua(address(AQUA)), ISwapVM(address(router)), pool);

        // Kolam memberi izin sekali kepada perantara.
        vm.startPrank(pool);
        tokenA.approve(address(adapter), type(uint256).max);
        tokenB.approve(address(adapter), type(uint256).max);
        vm.stopPrank();
    }

    function _program(bool gated, address allowedTaker, uint256 salt) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            gated ? p.build(ShieldedGate._onlyShieldedPool, ShieldedGateArgsBuilder.build(allowedTaker)) : bytes(""),
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

    function _takerData(bool isExactIn) internal view returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(adapter),
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

    function _ship(ISwapVM.Order memory order) internal {
        deal(address(tokenA), maker, VIRTUAL_A);
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

    // -------------------------------------------------------------------------

    function test_PoolSwapsThroughAdapter() public {
        ISwapVM.Order memory order = _order(_program(false, address(0), 1));
        _ship(order);
        deal(address(tokenB), pool, SWAP_AMOUNT);

        vm.prank(pool);
        (uint256 amountIn, uint256 amountOut) = adapter.swapForPool(
            order, address(tokenB), address(tokenA), SWAP_AMOUNT, SWAP_AMOUNT, 0, _takerData(true)
        );

        assertEq(amountIn, SWAP_AMOUNT, "amountIn");
        assertEq(amountOut, 20e18, "x*y=k: 50 * 100 / 250");

        // Kolam menerima hasilnya, perantara tidak menyimpan apa pun.
        assertEq(tokenA.balanceOf(pool), amountOut, "kolam menerima tokenOut");
        assertEq(tokenB.balanceOf(pool), 0, "kolam menyerahkan tokenIn");
        assertEq(tokenA.balanceOf(address(adapter)), 0, "perantara tidak menahan tokenOut");
        assertEq(tokenB.balanceOf(address(adapter)), 0, "perantara tidak menahan tokenIn");

        // Likuiditasnya memang datang dari dompet maker.
        assertEq(tokenA.balanceOf(maker), VIRTUAL_A - amountOut, "tokenOut keluar dari dompet maker");
        assertEq(tokenB.balanceOf(maker), VIRTUAL_B + amountIn, "tokenIn masuk ke dompet maker");
        assertEq(tokenA.balanceOf(address(AQUA)), 0, "Aqua tidak pernah menahan token");
    }

    /// @dev Detail integrasi yang mudah salah: gerbang melihat `msg.sender` ke
    ///   router, dan itu PERANTARA, bukan kolam. Alamat yang didaftarkan di
    ///   program harus alamat perantara.
    function test_GateMustNameTheAdapterNotThePool() public {
        ISwapVM.Order memory correct = _order(_program(true, address(adapter), 2));
        _ship(correct);
        deal(address(tokenB), pool, SWAP_AMOUNT);

        vm.prank(pool);
        (, uint256 amountOut) = adapter.swapForPool(
            correct, address(tokenB), address(tokenA), SWAP_AMOUNT, SWAP_AMOUNT, 0, _takerData(true)
        );
        assertEq(amountOut, 20e18, "gerbang menyebut perantara: lolos");

        // Menyebut alamat kolam justru menutup pintunya sendiri.
        ISwapVM.Order memory wrong = _order(_program(true, pool, 3));
        _ship(wrong);
        deal(address(tokenB), pool, SWAP_AMOUNT);

        vm.prank(pool);
        vm.expectRevert(
            abi.encodeWithSelector(ShieldedGate.ShieldedGateTakerNotAllowed.selector, address(adapter), pool)
        );
        adapter.swapForPool(wrong, address(tokenB), address(tokenA), SWAP_AMOUNT, SWAP_AMOUNT, 0, _takerData(true));
    }

    function test_OnlyPoolCanSwap() public {
        ISwapVM.Order memory order = _order(_program(false, address(0), 4));
        _ship(order);
        deal(address(tokenB), outsider, SWAP_AMOUNT);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(IqiaAquaTaker.IqiaTakerOnlyPool.selector, outsider));
        adapter.swapForPool(order, address(tokenB), address(tokenA), SWAP_AMOUNT, SWAP_AMOUNT, 0, _takerData(true));
    }

    /// @dev Callback hanya boleh datang dari router. Tanpa penjagaan ini, siapa
    ///   pun bisa menyuruh perantara mendorong tokennya ke maker mana saja.
    function test_OnlyRouterCanCallback() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(IqiaAquaTaker.IqiaTakerOnlyRouter.selector, outsider));
        adapter.preTransferInCallback(maker, address(0), address(tokenB), address(tokenA), 1e18, 0, bytes32(0), "");
    }

    function test_SlippageGuardRejectsThinOutput() public {
        ISwapVM.Order memory order = _order(_program(false, address(0), 5));
        _ship(order);
        deal(address(tokenB), pool, SWAP_AMOUNT);

        vm.prank(pool);
        vm.expectRevert(
            abi.encodeWithSelector(IqiaAquaTaker.IqiaTakerInsufficientOutput.selector, 20e18, 21e18)
        );
        adapter.swapForPool(order, address(tokenB), address(tokenA), SWAP_AMOUNT, SWAP_AMOUNT, 21e18, _takerData(true));
    }

    /// @dev Pada exact-out, SwapVM memakai kurang dari yang ditarik perantara.
    ///   Sisanya harus kembali ke kolam, bukan mengendap.
    function test_ExactOutRefundsLeftoverToPool() public {
        ISwapVM.Order memory order = _order(_program(false, address(0), 6));
        _ship(order);
        deal(address(tokenB), pool, SWAP_AMOUNT);

        uint256 desiredOut = 10e18;

        vm.prank(pool);
        (uint256 amountIn, uint256 amountOut) = adapter.swapForPool(
            order, address(tokenB), address(tokenA), desiredOut, SWAP_AMOUNT, 0, _takerData(false)
        );

        assertEq(amountOut, desiredOut, "exact-out memberi persis yang diminta");
        assertLt(amountIn, SWAP_AMOUNT, "hanya sebagian yang terpakai");
        assertEq(tokenB.balanceOf(pool), SWAP_AMOUNT - amountIn, "sisanya kembali ke kolam");
        assertEq(tokenB.balanceOf(address(adapter)), 0, "tidak ada yang mengendap di perantara");
    }

    function test_SweepReturnsStrandedTokensToPool() public {
        deal(address(tokenA), address(adapter), 5e18);

        vm.prank(outsider); // siapa pun boleh memicu; tujuannya tetap kolam
        adapter.sweep(IERC20(address(tokenA)));

        assertEq(tokenA.balanceOf(pool), 5e18, "tersapu ke kolam");
        assertEq(tokenA.balanceOf(address(adapter)), 0, "perantara kosong");
    }
}
