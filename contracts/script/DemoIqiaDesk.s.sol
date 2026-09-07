// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console } from "forge-std/Script.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";

import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";

import { MockERC20 } from "../src/MockERC20.sol";
import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { IqiaAquaTaker } from "../src/iqia/IqiaAquaTaker.sol";
import { ExclusiveFill, ExclusiveFillArgsBuilder } from "../src/iqia/instructions/ExclusiveFill.sol";
import { SolvencyGuard, SolvencyGuardArgsBuilder } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Demo transfer token on-chain lewat Aqua + SwapVM.
///
/// Menjalankan seluruh alur sebagai transaksi sungguhan:
///   1. Deploy Aqua, router Iqia, dan perantara taker
///   2. Maker memberi izin sekali, lalu membuka posisi lewat `ship()`
///   3. Buktikan saldo dompet maker TIDAK berkurang sedikit pun
///   4. Meja mengeksekusi swap
///   5. Buktikan token benar-benar berpindah, dan Aqua tidak menahan apa pun
///   6. Maker menutup posisi lewat `dock()`, juga tanpa transfer token
///
/// Jalankan:
///   anvil &
///   forge script script/DemoIqiaDesk.s.sol --rpc-url http://localhost:8545 --broadcast
contract DemoIqiaDeskScript is Script, IqiaOpcodes {
    using ProgramBuilder for Program;

    /// @dev Akun bawaan anvil, dipakai kalau env tidak mengisi.
    uint256 constant ANVIL_DESK_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant ANVIL_MAKER_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

    /// @dev Di testnet sungguhan satu dompet mengerjakan keduanya, jadi
    ///   `MAKER_KEY` jatuh ke `DESK_KEY` kalau tidak diisi terpisah.
    function _deskKey() internal view returns (uint256) {
        return vm.envOr("DESK_KEY", ANVIL_DESK_KEY);
    }

    function _makerKey() internal view returns (uint256) {
        return vm.envOr("MAKER_KEY", vm.envOr("DESK_KEY", ANVIL_MAKER_KEY));
    }

    uint256 constant MAKER_WETH = 10e18;
    uint256 constant MAKER_USDC = 35_000e6;
    uint256 constant SWAP_USDC = 3_500e6;
    uint32 constant MAX_SURCHARGE_BPS = 0.05e9; // 5% saat sandaran nol

    /// @dev `IqiaOpcodes` menyimpan alamat Aqua sebagai immutable, jadi ia harus
    ///   sudah diketahui saat kontrak skrip ini dikonstruksi — sebelum Aqua
    ///   sempat dideploy.
    ///
    ///   Versi lama MENEBAKNYA dari nonce 0 akun anvil #0, ditulis mati. Itu
    ///   hanya benar di rantai yang baru lahir dengan akun yang belum pernah
    ///   dipakai. Di dompet testnet sungguhan yang sudah punya riwayat, nonce-nya
    ///   bukan nol dan tebakannya meleset — dan menebak nonce saat konstruksi
    ///   skrip pun tidak akurat, karena forge sendiri memakai akun itu sebelum
    ///   broadcast pertama.
    ///
    ///   Jadi tidak ada tebakan lagi: Aqua di-deploy lebih dulu oleh
    ///   `script/deploy.sh` dan alamatnya diberikan lewat `AQUA`. Satu perintah
    ///   yang sama bekerja di anvil, testnet, maupun fork.
    constructor() IqiaOpcodes(_resolveAqua()) { }

    function _resolveAqua() internal view returns (address) {
        address existing = vm.envOr("AQUA", address(0));
        require(existing != address(0), "AQUA belum diset. Pakai script/deploy.sh, jangan forge script langsung.");
        return existing;
    }

    function vmSafeComputeCreateAddress(address deployer, uint256 nonce) internal pure returns (address) {
        // RLP untuk nonce 0
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, bytes1(0x80))))));
    }

    function run() external {
        uint256 deskKey = _deskKey();
        uint256 makerKey = _makerKey();
        address desk = vm.addr(deskKey);
        address maker = vm.addr(makerKey);

        // ---------------------------------------------------------- deploy
        vm.startBroadcast(deskKey);
        Aqua aqua = Aqua(_resolveAqua());
        MockERC20 weth = new MockERC20("Wrapped Ether", "WETH", 18);
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        IqiaSwapVMRouter router =
            new IqiaSwapVMRouter(address(aqua), address(0), desk);
        IqiaAquaTaker adapter = new IqiaAquaTaker(IAqua(address(aqua)), ISwapVM(address(router)), desk);
        vm.stopBroadcast();


        console.log("Aqua      ", address(aqua));
        console.log("Router    ", address(router));
        console.log("Adapter   ", address(adapter));

        // ------------------------------------------------- siapkan saldo
        vm.startBroadcast(deskKey);
        weth.mint(maker, MAKER_WETH);
        usdc.mint(maker, MAKER_USDC);
        usdc.mint(desk, SWAP_USDC);
        usdc.approve(address(adapter), type(uint256).max);
        vm.stopBroadcast();

        // ------------------------------------------------- buka posisi
        bytes memory program = _buildProgram(address(adapter));
        ISwapVM.Order memory order = _buildOrder(maker, program);

        uint256 makerWethBefore = weth.balanceOf(maker);
        uint256 makerUsdcBefore = usdc.balanceOf(maker);

        vm.startBroadcast(makerKey);
        weth.approve(address(aqua), type(uint256).max);
        usdc.approve(address(aqua), type(uint256).max);
        bytes32 strategyHash = aqua.ship(
            address(router),
            abi.encode(order),
            dynamic([address(weth), address(usdc)]),
            dynamic([MAKER_WETH, MAKER_USDC])
        );
        vm.stopBroadcast();

        console.log("");
        console.log("=== Setelah ship() ===");
        console.log("  dompet maker WETH ", weth.balanceOf(maker));
        console.log("  dompet maker USDC ", usdc.balanceOf(maker));
        console.log("  ditahan Aqua WETH ", weth.balanceOf(address(aqua)));
        require(weth.balanceOf(maker) == makerWethBefore, "ship() TIDAK BOLEH memindahkan token");
        require(usdc.balanceOf(maker) == makerUsdcBefore, "ship() TIDAK BOLEH memindahkan token");
        require(weth.balanceOf(address(aqua)) == 0, "Aqua tidak boleh menahan token");

        // ------------------------------------------------- eksekusi swap
        vm.startBroadcast(deskKey);
        (uint256 amountIn, uint256 amountOut) = adapter.swapForPool(
            abi.encode(order),
            address(usdc),
            address(weth),
            SWAP_USDC,
            SWAP_USDC,
            0,
            _buildTakerData(address(adapter))
        );
        vm.stopBroadcast();

        console.log("");
        console.log("=== Setelah swap ===");
        console.log("  USDC masuk        ", amountIn);
        console.log("  WETH keluar       ", amountOut);
        console.log("  dompet maker WETH ", weth.balanceOf(maker));
        console.log("  dompet maker USDC ", usdc.balanceOf(maker));
        console.log("  meja WETH         ", weth.balanceOf(desk));
        console.log("  ditahan Aqua      ", weth.balanceOf(address(aqua)));

        require(amountOut > 0, "swap harus menghasilkan keluaran");
        // Di testnet satu dompet biasanya mengerjakan dua peran sekaligus, dan
        // kalau maker == meja, WETH yang keluar langsung kembali ke akun yang
        // sama — jadi selisihnya nol, bukan `-amountOut`. Yang dibuktikan tetap
        // sama: token benar-benar berpindah, dan berpindahnya dari DOMPET.
        if (maker != desk) {
            require(weth.balanceOf(maker) == makerWethBefore - amountOut, "WETH keluar dari dompet maker");
            require(usdc.balanceOf(maker) == makerUsdcBefore + amountIn, "USDC masuk ke dompet maker");
            require(weth.balanceOf(desk) == amountOut, "meja menerima WETH");
        } else {
            require(weth.balanceOf(maker) == makerWethBefore, "WETH kembali ke dompet yang sama");
            require(usdc.balanceOf(maker) == makerUsdcBefore + amountIn - SWAP_USDC, "USDC bersih dari fee");
        }
        require(weth.balanceOf(address(aqua)) == 0, "Aqua tetap tidak menahan token");

        // ------------------------------------------------- tutup posisi
        uint256 beforeDockWeth = weth.balanceOf(maker);

        vm.startBroadcast(makerKey);
        aqua.dock(address(router), strategyHash, dynamic([address(weth), address(usdc)]));
        vm.stopBroadcast();

        console.log("");
        console.log("=== Setelah dock() ===");
        console.log("  dompet maker WETH ", weth.balanceOf(maker));
        require(weth.balanceOf(maker) == beforeDockWeth, "dock() TIDAK BOLEH memindahkan token");

        console.log("");
        console.log("Selesai. Token berpindah hanya saat swap, tidak saat buka atau tutup posisi.");

        // Posisi di atas sudah di-dock, jadi tidak bisa dipakai frontend. Kirim
        // satu posisi baru yang tetap terbuka, lalu cetak env-nya.
        _shipLivePositionForFrontend(aqua, router, adapter, weth, usdc, maker);
    }

    /// @dev Mengirim posisi kedua yang dibiarkan terbuka, supaya frontend punya
    ///   sesuatu untuk diajak berdagang. Salt-nya berbeda agar strategyHash unik.
    function _shipLivePositionForFrontend(
        Aqua aqua,
        IqiaSwapVMRouter router,
        IqiaAquaTaker adapter,
        MockERC20 weth,
        MockERC20 usdc,
        address maker
    ) internal {
        uint256 liveSalt = 2;

        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory program = bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(MAX_SURCHARGE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint64(liveSalt)))
        );
        ISwapVM.Order memory order = _buildOrder(maker, program);

        vm.startBroadcast(_makerKey());
        weth.mint(maker, MAKER_WETH);
        usdc.mint(maker, MAKER_USDC);
        aqua.ship(
            address(router),
            abi.encode(order),
            dynamic([address(weth), address(usdc)]),
            dynamic([MAKER_WETH, MAKER_USDC])
        );
        vm.stopBroadcast();

        console.log("");
        console.log("=== Salin ke frontend/.env.local ===");
        // Rantainya dibaca, bukan diasumsikan. Dulu tertulis 31337 mati, jadi
        // deploy ke testnet mencetak env yang salah dan frontend-nya menembak
        // rantai lain tanpa satu pun tanda bahwa itu sebabnya.
        console.log(string.concat("VITE_CHAIN_ID=", vm.toString(block.chainid)));
        console.log(
            string.concat(
                "VITE_CHAIN_NAME=",
                block.chainid == 31337 ? "Anvil" : block.chainid == 84532 ? "Base Sepolia" : "Chain"
            )
        );
        console.log(string.concat("VITE_SWAP_VM_ROUTER=", vm.toString(address(router))));
        console.log(string.concat("VITE_AQUA=", vm.toString(address(aqua))));
        console.log(string.concat("VITE_DESK_MAKER=", vm.toString(maker)));
        console.log(string.concat("VITE_DESK_SALT=", vm.toString(liveSalt)));
        console.log(string.concat("VITE_DESK_SURCHARGE_BPS=", vm.toString(uint256(MAX_SURCHARGE_BPS))));
        console.log(string.concat("VITE_WETH_ADDRESS=", vm.toString(address(weth))));
        console.log(string.concat("VITE_USDC_ADDRESS=", vm.toString(address(usdc))));
        console.log(string.concat("VITE_POOL_DEPLOY_BLOCK=", vm.toString(block.number)));
        console.log("VITE_MARKETS_LOOKBACK_BLOCKS=0");
        console.log(string.concat("# adapter (kolam): ", vm.toString(address(adapter))));
    }

    function _buildProgram(address exclusiveTaker) internal view returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(ExclusiveFill._onlyExclusiveTaker, ExclusiveFillArgsBuilder.build(exclusiveTaker)),
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(MAX_SURCHARGE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint256(1)))
        );
    }

    function _buildOrder(address maker, bytes memory program) internal pure returns (ISwapVM.Order memory) {
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

    function _buildTakerData(address taker) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: taker,
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
}
