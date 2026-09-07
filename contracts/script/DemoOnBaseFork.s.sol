// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
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

/// @notice Demo di atas fork Base mainnet, memakai kontrak Aqua RESMI.
///
/// @dev Ini jawaban langsung untuk syarat kualifikasi:
///
///   "Official Aqua/SwapVM contracts must be used (redeployments of a modified
///    SwapVM contract is allowed)"
///   "Onchain execution of token transfers should be presented during the final
///    demo (local forks are ok)"
///
///   Yang dipakai di sini:
///     - Aqua di 0x1111113ccf… — kontrak RESMI yang sungguhan, tidak di-deploy
///       ulang, cuma dipakai apa adanya lewat fork
///     - IqiaSwapVMRouter — SwapVM yang kita perluas dengan opcode 22 dan 23,
///       persis "redeployment of a modified SwapVM" yang kurung itu izinkan
///     - WETH dan USDC Base yang asli, bukan mock
///
///   Kenapa fork dan bukan testnet: Aqua ter-deploy di 16 jaringan dan SEMUANYA
///   mainnet. Di testnet kita terpaksa men-deploy Aqua sendiri — dan kurung
///   syaratnya cuma mengizinkan SwapVM yang di-deploy ulang, bukan Aqua. Fork
///   memberi kontrak resmi yang asli tanpa uang sungguhan.
///
///   Jalankan:
///     anvil --fork-url https://mainnet.base.org --port 8546 --chain-id 8453
///     forge script script/DemoOnBaseFork.s.sol --rpc-url http://127.0.0.1:8546 \
///       --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
contract DemoOnBaseFork is Script, IqiaOpcodes {
    using ProgramBuilder for Program;

    /// @dev Aqua resmi 1inch. Alamat yang sama di 16 jaringan.
    address constant OFFICIAL_AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;

    address constant BASE_WETH = 0x4200000000000000000000000000000000000006;
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint256 constant DESK_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant MAKER_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant TAKER_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;

    uint256 constant MAKER_WETH = 10e18;
    uint256 constant MAKER_USDC = 35_000e6;
    uint256 constant SWAP_USDC = 3_500e6;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.003e9;

    constructor() IqiaOpcodes(OFFICIAL_AQUA) { }

    function run() external {
        address desk = vm.addr(DESK_KEY);
        address maker = vm.addr(MAKER_KEY);
        address taker = vm.addr(TAKER_KEY);

        require(OFFICIAL_AQUA.code.length > 0, "Aqua resmi tidak ada: apakah fork-nya dari Base mainnet?");
        require(BASE_USDC.code.length > 0, "USDC Base tidak ada di fork ini");
        console.log("Aqua RESMI     ", OFFICIAL_AQUA, "-> bytecode", OFFICIAL_AQUA.code.length);

        // Router-nya di-deploy terpisah oleh script/fork-demo.sh lewat
        // `forge create`, bukan di sini. Sebabnya perkakas, bukan rancangan:
        // forge gagal menguraikan argumen konstruktor router saat menulis
        // artefak broadcast ("type check failed for offset"), dan seluruh
        // broadcast batal — termasuk transaksi yang sudah benar.
        IqiaSwapVMRouter router = IqiaSwapVMRouter(payable(vm.envAddress("ROUTER")));
        require(address(router).code.length > 0, "ROUTER belum ter-deploy di fork ini");
        console.log("Router Iqia    ", address(router));


        IAqua aqua = IAqua(OFFICIAL_AQUA);
        ISwapVM.Order memory order = _order(maker, _program());

        uint256 makerWethBefore = IERC20(BASE_WETH).balanceOf(maker);
        uint256 makerUsdcBefore = IERC20(BASE_USDC).balanceOf(maker);

        // ---------------------------------------------------- buka posisi
        vm.startBroadcast(MAKER_KEY);
        IERC20(BASE_WETH).approve(OFFICIAL_AQUA, type(uint256).max);
        IERC20(BASE_USDC).approve(OFFICIAL_AQUA, type(uint256).max);
        bytes32 strategyHash = aqua.ship(
            address(router),
            abi.encode(order),
            dynamic([BASE_WETH, BASE_USDC]),
            dynamic([MAKER_WETH, MAKER_USDC])
        );
        vm.stopBroadcast();

        console.log("");
        console.log("=== Setelah ship() pada Aqua RESMI ===");
        console.log("  strategyHash    ", vm.toString(strategyHash));
        console.log("  dompet maker WETH", IERC20(BASE_WETH).balanceOf(maker));
        console.log("  ditahan Aqua WETH", IERC20(BASE_WETH).balanceOf(OFFICIAL_AQUA));
        require(IERC20(BASE_WETH).balanceOf(maker) == makerWethBefore, "ship() TIDAK BOLEH memindahkan token");
        require(IERC20(BASE_USDC).balanceOf(maker) == makerUsdcBefore, "ship() TIDAK BOLEH memindahkan token");

        // ---------------------------------------------------- eksekusi swap
        // Taker dompet biasa, tanpa kontrak adapter: useTransferFromAndAquaPush.
        uint256 takerWethBefore = IERC20(BASE_WETH).balanceOf(taker);

        vm.startBroadcast(TAKER_KEY);
        IERC20(BASE_USDC).approve(address(router), type(uint256).max);
        (, uint256 amountOut,) =
            router.swap(order, BASE_USDC, BASE_WETH, SWAP_USDC, _takerData(taker));
        vm.stopBroadcast();

        console.log("");
        console.log("=== Setelah swap - TRANSFER TOKEN SUNGGUHAN ===");
        console.log("  USDC masuk       ", SWAP_USDC);
        console.log("  WETH keluar      ", amountOut);
        console.log("  dompet maker WETH", IERC20(BASE_WETH).balanceOf(maker));
        console.log("  dompet maker USDC", IERC20(BASE_USDC).balanceOf(maker));
        console.log("  dompet taker WETH", IERC20(BASE_WETH).balanceOf(taker));

        require(amountOut > 0, "swap harus menghasilkan keluaran");
        require(
            IERC20(BASE_WETH).balanceOf(maker) == makerWethBefore - amountOut,
            "WETH harus keluar dari DOMPET maker, bukan dari kontrak"
        );
        require(
            IERC20(BASE_USDC).balanceOf(maker) == makerUsdcBefore + SWAP_USDC,
            "USDC harus masuk ke DOMPET maker"
        );
        require(
            IERC20(BASE_WETH).balanceOf(taker) == takerWethBefore + amountOut,
            "taker harus menerima WETH"
        );
        require(IERC20(BASE_WETH).balanceOf(OFFICIAL_AQUA) == 0, "Aqua tidak pernah menahan token");

        console.log("");
        console.log("=== Konfigurasi frontend ===");
        console.log("VITE_CHAIN_ID=8453");
        console.log("VITE_CHAIN_NAME=Base fork");
        console.log(string.concat("VITE_AQUA=", vm.toString(OFFICIAL_AQUA)));
        console.log(string.concat("VITE_SWAP_VM_ROUTER=", vm.toString(address(router))));
        console.log(string.concat("VITE_DESK_MAKER=", vm.toString(maker)));
        console.log(string.concat("VITE_WETH_ADDRESS=", vm.toString(BASE_WETH)));
        console.log(string.concat("VITE_USDC_ADDRESS=", vm.toString(BASE_USDC)));
    }

    /// @dev Strategi "Santai": guard -> fee -> kurva. Urutan wajib, lihat
    ///   SolvencyGuard.sol.
    function _program() internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint64(block.timestamp)))
        );
    }

    function _order(address maker, bytes memory program) internal pure returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: maker, receiver: address(0), shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true, allowZeroAmountIn: false,
            hasPreTransferInHook: false, hasPostTransferInHook: false,
            hasPreTransferOutHook: false, hasPostTransferOutHook: false,
            preTransferInTarget: address(0), preTransferInData: "",
            postTransferInTarget: address(0), postTransferInData: "",
            preTransferOutTarget: address(0), preTransferOutData: "",
            postTransferOutTarget: address(0), postTransferOutData: "",
            program: program
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
