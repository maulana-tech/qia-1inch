// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

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

import { IqiaPool, IPoseidon } from "../src/IqiaPool.sol";
import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { IqiaAquaTaker } from "../src/iqia/IqiaAquaTaker.sol";
import { ShieldedGate, ShieldedGateArgsBuilder } from "../src/iqia/instructions/ShieldedGate.sol";

contract PoseidonStub is IPoseidon {
    function hash(uint256[2] memory inputs) external pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(inputs[0], inputs[1])));
    }
}

contract VerifierStub {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

/// @notice Kolam menyeimbangkan isinya lewat meja Aqua — bukan lewat AMM publik.
contract IqiaPoolRebalanceTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    IqiaPool public pool;
    IqiaSwapVMRouter public router;
    IqiaAquaTaker public desk;
    TokenMock public tokenA;
    TokenMock public tokenB;

    address public maker;
    address public outsider;

    uint256 constant VIRTUAL_A = 100e18;
    uint256 constant VIRTUAL_B = 200e18;
    uint256 constant POOL_B = 50e18;

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        maker = vm.addr(0x1234);
        outsider = vm.addr(0xBAD);

        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");

        pool = new IqiaPool(address(new PoseidonStub()), address(new VerifierStub()));
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this), "IqiaSwapVM", "1.0.0");
        desk = new IqiaAquaTaker(IAqua(address(AQUA)), ISwapVM(address(router)), address(pool));

        pool.setDesk(address(desk));
    }

    function _order(uint256 salt) internal view returns (ISwapVM.Order memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory program = bytes.concat(
            // Gerbang menyebut MEJA, karena meja itulah msg.sender ke router.
            p.build(ShieldedGate._onlyShieldedPool, ShieldedGateArgsBuilder.build(address(desk))),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(salt))
        );
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

    function _takerData() internal view returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(desk),
            isExactIn: true,
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

    function test_OwnerIsDeployer() public view {
        assertEq(pool.owner(), address(this), "kepemilikan ditetapkan saat konstruksi");
    }

    /// @dev Sebelumnya kolam sama sekali tidak punya kontrol akses — setTeeAddress
    ///   terbuka untuk siapa pun.
    function test_OnlyOwnerCanSetDesk() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(IqiaPool.NotOwner.selector, outsider));
        pool.setDesk(outsider);
    }

    function test_OnlyOwnerCanRebalance() public {
        ISwapVM.Order memory order = _order(1);
        _ship(order);
        deal(address(tokenB), address(pool), POOL_B);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(IqiaPool.NotOwner.selector, outsider));
        pool.rebalance(abi.encode(order), address(tokenB), address(tokenA), POOL_B, POOL_B, 0, _takerData());
    }

    function test_RebalanceRequiresDesk() public {
        IqiaPool fresh = new IqiaPool(address(new PoseidonStub()), address(new VerifierStub()));
        ISwapVM.Order memory order = _order(2);

        vm.expectRevert(IqiaPool.DeskNotSet.selector);
        fresh.rebalance(abi.encode(order), address(tokenB), address(tokenA), 1e18, 1e18, 0, _takerData());
    }

    function test_RebalanceSwapsPoolAssetsThroughAqua() public {
        ISwapVM.Order memory order = _order(3);
        _ship(order);
        deal(address(tokenB), address(pool), POOL_B);

        uint256 expectedOut = (POOL_B * VIRTUAL_A) / (VIRTUAL_B + POOL_B); // x*y=k

        (uint256 amountIn, uint256 amountOut) = pool.rebalance(
            abi.encode(order), address(tokenB), address(tokenA), POOL_B, POOL_B, 0, _takerData()
        );

        assertEq(amountIn, POOL_B, "seluruh masukan terpakai");
        assertEq(amountOut, expectedOut, "harga dari kurva di dalam bytecode");

        // Komposisi kolam berubah.
        assertEq(tokenB.balanceOf(address(pool)), 0, "tokenB kolam terpakai");
        assertEq(tokenA.balanceOf(address(pool)), expectedOut, "kolam menerima tokenA");

        // Likuiditasnya datang dari dompet maker, bukan dari kolam mana pun.
        assertEq(tokenA.balanceOf(maker), VIRTUAL_A - expectedOut, "keluar dari dompet maker");
        assertEq(tokenB.balanceOf(maker), VIRTUAL_B + POOL_B, "masuk ke dompet maker");
        assertEq(tokenA.balanceOf(address(AQUA)), 0, "Aqua tidak pernah menahan token");
        assertEq(tokenB.balanceOf(address(AQUA)), 0, "Aqua tidak pernah menahan token");
    }

    /// @dev Izin dicabut lagi setelah rebalance, jadi meja tidak menyimpan hak
    ///   belanja atas dana kolam di luar satu transaksi.
    function test_RebalanceLeavesNoStandingAllowance() public {
        ISwapVM.Order memory order = _order(4);
        _ship(order);
        deal(address(tokenB), address(pool), POOL_B);

        pool.rebalance(abi.encode(order), address(tokenB), address(tokenA), POOL_B, POOL_B, 0, _takerData());

        assertEq(tokenB.allowance(address(pool), address(desk)), 0, "izin tidak boleh tersisa");
    }

    function test_RebalanceRespectsSlippageGuard() public {
        ISwapVM.Order memory order = _order(5);
        _ship(order);
        deal(address(tokenB), address(pool), POOL_B);

        uint256 expectedOut = (POOL_B * VIRTUAL_A) / (VIRTUAL_B + POOL_B);

        vm.expectRevert(
            abi.encodeWithSelector(
                IqiaAquaTaker.IqiaTakerInsufficientOutput.selector, expectedOut, expectedOut + 1
            )
        );
        pool.rebalance(
            abi.encode(order), address(tokenB), address(tokenA), POOL_B, POOL_B, expectedOut + 1, _takerData()
        );
    }

    /// @dev Regresi: kolamnya masih menerima setoran seperti sebelumnya.
    function test_DepositStillWorks() public {
        deal(address(tokenA), outsider, 10e18);
        vm.startPrank(outsider);
        tokenA.approve(address(pool), 10e18);
        pool.deposit(bytes32(uint256(0xC0FFEE)), address(tokenA), 10e18);
        vm.stopPrank();

        assertEq(tokenA.balanceOf(address(pool)), 10e18, "setoran masuk ke kolam");
        assertEq(pool.nextIndex(), 1, "commitment tercatat di pohon");
    }
}
