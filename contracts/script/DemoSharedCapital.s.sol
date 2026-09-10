// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console } from "forge-std/Script.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Fee, FeeArgsBuilder } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";

import { MockERC20 } from "../src/MockERC20.sol";
import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { SolvencyGuard, SolvencyGuardArgsBuilder } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Satu kantong modal, tiga pasar, dan harga yang saling terhubung.
///
/// @dev Ini demo untuk properti Aqua yang tidak dimiliki AMM mana pun. `ship()`
///   tidak memindahkan token DAN tidak memeriksa saldo, jadi 10 WETH yang sama
///   bisa terdaftar sebagai likuiditas di tiga pasar sekaligus. Di Uniswap, 10
///   WETH-mu ada di SATU pool.
///
///   Yang membuatnya tidak sembrono: `SolvencyGuard` membaca dompet yang sama di
///   setiap pasar. Skrip ini menukar di SATU pasar lalu menunjukkan dua pasar
///   LAIN ikut memburuk harganya — tanpa keeper, tanpa oracle, tanpa transaksi
///   yang menyentuh mereka.
///
///   Butuh AQUA dan ROUTER dari env. Dijalankan lewat script/shared-capital.sh.
contract DemoSharedCapital is Script, IqiaOpcodes {
    using ProgramBuilder for Program;

    uint256 constant ANVIL_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    /// @dev Penukar HARUS akun lain. Kalau maker menukar dari dompetnya sendiri,
    ///   WETH keluar lalu langsung kembali ke dompet yang sama — selisihnya nol,
    ///   dan seluruh demo kehilangan maknanya.
    uint256 constant TAKER_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

    /// @dev Modal NYATA. Perhatikan: dipakai di tiga pasar.
    uint256 constant REAL_WETH = 10e18;
    uint256 constant QUOTE_SIDE = 35_000e6;
    uint256 constant SWAP_IN = 8_000e6;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.003e9;

    constructor() IqiaOpcodes(vm.envAddress("AQUA")) { }

    function _key() internal view returns (uint256) {
        return vm.envOr("DESK_KEY", ANVIL_KEY);
    }

    function run() external {
        uint256 key = _key();
        address maker = vm.addr(key);
        Aqua aqua = Aqua(vm.envAddress("AQUA"));
        IqiaSwapVMRouter router = IqiaSwapVMRouter(payable(vm.envAddress("ROUTER")));

        // ----------------------------------------------------- tiga pasar
        vm.startBroadcast(key);
        MockERC20 weth = new MockERC20("Wrapped Ether", "WETH", 18);
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        MockERC20 dai = new MockERC20("Dai", "DAI", 6);
        MockERC20 wbtc = new MockERC20("Wrapped Bitcoin", "WBTC", 6);

        // Modal nyata dicetak SEKALI. Tidak ditambah untuk pasar berikutnya.
        weth.mint(maker, REAL_WETH);
        usdc.mint(maker, QUOTE_SIDE);
        dai.mint(maker, QUOTE_SIDE);
        wbtc.mint(maker, QUOTE_SIDE);

        weth.approve(address(aqua), type(uint256).max);
        usdc.approve(address(aqua), type(uint256).max);
        dai.approve(address(aqua), type(uint256).max);
        wbtc.approve(address(aqua), type(uint256).max);

        ISwapVM.Order memory a = _order(maker, _program(1));
        ISwapVM.Order memory b = _order(maker, _program(2));
        ISwapVM.Order memory c = _order(maker, _program(3));

        // 10 WETH yang SAMA, tiga kali.
        aqua.ship(address(router), abi.encode(a),
            dynamic([address(weth), address(usdc)]), dynamic([REAL_WETH, QUOTE_SIDE]));
        aqua.ship(address(router), abi.encode(b),
            dynamic([address(weth), address(dai)]), dynamic([REAL_WETH, QUOTE_SIDE]));
        aqua.ship(address(router), abi.encode(c),
            dynamic([address(weth), address(wbtc)]), dynamic([REAL_WETH, QUOTE_SIDE]));
        vm.stopBroadcast();

        require(weth.balanceOf(maker) == REAL_WETH, "ship TIDAK BOLEH memindahkan token");

        console.log("");
        console.log("=== Modal bersama ===");
        console.log("  WETH nyata di dompet    ", weth.balanceOf(maker));
        console.log("  WETH terdaftar (3 pasar)", REAL_WETH * 3);
        console.log("  efisiensi modal          3x");

        uint256 q1 = _quote(router, b, maker, address(dai), address(weth));
        uint256 q2 = _quote(router, c, maker, address(wbtc), address(weth));
        console.log("");
        console.log("=== Kutipan SEBELUM ada yang menukar ===");
        console.log("  pasar B (WETH/DAI)      ", q1);
        console.log("  pasar C (WETH/WBTC)     ", q2);

        // ------------------------------------- satu swap di pasar A saja
        address taker = vm.addr(TAKER_KEY);
        vm.startBroadcast(key);
        usdc.mint(taker, SWAP_IN);
        vm.stopBroadcast();

        vm.startBroadcast(TAKER_KEY);
        usdc.approve(address(router), type(uint256).max);
        router.swap(a, address(usdc), address(weth), SWAP_IN, _takerData(taker));
        vm.stopBroadcast();

        uint256 q1b = _quote(router, b, maker, address(dai), address(weth));
        uint256 q2b = _quote(router, c, maker, address(wbtc), address(weth));

        console.log("");
        console.log("=== Sesudah swap di pasar A, tanpa menyentuh B dan C ===");
        console.log("  WETH tersisa di dompet  ", weth.balanceOf(maker));
        console.log("  pasar B jadi            ", q1b);
        console.log("  pasar C jadi            ", q2b);

        require(weth.balanceOf(maker) < REAL_WETH, "modal bersama harus berkurang");
        require(q1b < q1, "pasar B harus ikut memburuk");
        require(q2b < q2, "pasar C harus ikut memburuk");

        console.log("");
        console.log("Dua pasar yang tidak disentuh siapa pun ikut bergerak.");
        console.log("Tidak ada keeper, tidak ada oracle. Mereka membaca dompet yang sama.");

        console.log("");
        console.log("=== Konfigurasi frontend ===");
        console.log(string.concat("VITE_WETH_ADDRESS=", vm.toString(address(weth))));
        console.log(string.concat("VITE_USDC_ADDRESS=", vm.toString(address(usdc))));
        console.log(string.concat("VITE_DAI_ADDRESS=", vm.toString(address(dai))));
        console.log(string.concat("VITE_WBTC_ADDRESS=", vm.toString(address(wbtc))));
        console.log(string.concat("VITE_DESK_MAKER=", vm.toString(maker)));
    }

    function _program(uint64 saltValue) internal pure returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(saltValue))
        );
    }

    function _quote(
        IqiaSwapVMRouter router,
        ISwapVM.Order memory order,
        address taker,
        address tokenIn,
        address tokenOut
    ) internal returns (uint256 out) {
        (, out,) = router.quote(order, tokenIn, tokenOut, 1_000e6, _takerData(taker));
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

    function _takerData(address taker) internal pure returns (bytes memory) {
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
}
