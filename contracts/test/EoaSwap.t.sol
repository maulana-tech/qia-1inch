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

import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";

/// @notice Dompet biasa berdagang langsung ke router, tanpa kontrak perantara.
///
/// @dev Ini yang dipakai UI. Alur perantara (`IqiaAquaTaker`) mengharuskan taker
///   berupa kontrak yang mengimplementasikan `ITakerCallbacks`, dan itu tidak
///   mungkin untuk dompet pengguna. Flag `useTransferFromAndAquaPush` membuat
///   SwapVM sendiri yang menarik token dari taker dan mendorongnya ke Aqua,
///   sehingga taker cukup memberi izin seperti pada DEX biasa.
contract EoaSwapTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    IqiaSwapVMRouter public router;
    TokenMock public tokenA;
    TokenMock public tokenB;

    address public maker;
    address public user;

    uint256 constant VIRTUAL_A = 100e18;
    uint256 constant VIRTUAL_B = 200e18;
    uint256 constant SWAP_AMOUNT = 50e18;

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        maker = vm.addr(0x1234);
        user = vm.addr(0xEA);
        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this), "IqiaSwapVM", "1.0.0");
    }

    function test_PlainWalletCanSwapWithoutAdapter() public {
        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory prog = bytes.concat(p.build(XYCSwap._xycSwapXD), p.build(Controls._salt, abi.encodePacked(uint64(1))));

        ISwapVM.Order memory order = MakerTraitsLib.build(MakerTraitsLib.Args({
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

        deal(address(tokenA), maker, VIRTUAL_A);
        deal(address(tokenB), maker, VIRTUAL_B);
        vm.startPrank(maker);
        tokenA.approve(address(AQUA), type(uint256).max);
        tokenB.approve(address(AQUA), type(uint256).max);
        AQUA.ship(address(router), abi.encode(order),
            dynamic([address(tokenA), address(tokenB)]), dynamic([VIRTUAL_A, VIRTUAL_B]));
        vm.stopPrank();

        // Taker adalah dompet biasa: cukup memberi izin ke router.
        deal(address(tokenB), user, SWAP_AMOUNT);
        vm.startPrank(user);
        tokenB.approve(address(router), type(uint256).max);

        bytes memory takerData = TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: user,
            isExactIn: true,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: true, // SwapVM yang menarik dan mendorong
            threshold: "",
            to: address(0),
            deadline: 0,
            hasPreTransferInCallback: false, // tidak perlu callback sama sekali
            hasPreTransferOutCallback: false,
            preTransferInHookData: "", postTransferInHookData: "",
            preTransferOutHookData: "", postTransferOutHookData: "",
            preTransferInCallbackData: "", preTransferOutCallbackData: "",
            instructionsArgs: "", signature: ""
        }));

        (uint256 amountIn, uint256 amountOut,) =
            router.swap(order, address(tokenB), address(tokenA), SWAP_AMOUNT, takerData);
        vm.stopPrank();

        assertEq(amountIn, SWAP_AMOUNT, "amountIn");
        assertEq(amountOut, 20e18, "x*y=k");
        assertEq(tokenA.balanceOf(user), 20e18, "dompet menerima tokenOut");
        assertEq(tokenB.balanceOf(user), 0, "dompet menyerahkan tokenIn");
        assertEq(tokenA.balanceOf(maker), VIRTUAL_A - 20e18, "keluar dari dompet maker");
        assertEq(tokenA.balanceOf(address(AQUA)), 0, "Aqua tidak menahan token");
    }
}
