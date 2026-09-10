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
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";

import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { SolvencyGuard, SolvencyGuardArgsBuilder } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Memindahkan meja ke registry Aqua RESMI 1inch.
///
/// # Kenapa pindah
///
/// Syarat tracknya: "Official Aqua/SwapVM contracts must be used (redeployments
/// of a modified SwapVM contract is allowed)". Deploy ulang diizinkan untuk
/// SwapVM — dan router kita memang itu, dengan dua opcode tambahan. Untuk Aqua
/// yang diminta yang resmi, dan sampai sekarang kita memakai deployment sendiri.
///
/// Aqua resmi ADA di Ethereum Sepolia, dan bytecode-nya byte-identik dengan yang
/// di Base mainnet (keccak `0x720bc02d…`). Ia satu-satunya testnet yang
/// memilikinya — Base Sepolia, Arbitrum Sepolia, dan Optimism Sepolia semuanya
/// kosong di alamat itu. Jadi rantainya sudah benar; yang perlu diganti cuma
/// registry yang kita tunjuk.
///
/// # Kenapa router harus ikut di-deploy ulang
///
/// Alamat Aqua tertanam `immutable` di konstruktor router — lewat `SwapVM` dan
/// lewat `SolvencyGuard` yang membaca izin maker terhadap registry itu. Tidak
/// ada setter, dan memang seharusnya tidak ada: router yang bisa dipindahkan ke
/// registry lain adalah router yang bisa mengarahkan ulang seluruh likuiditas
/// makernya.
///
/// # Yang TIDAK ikut pindah
///
/// Posisi yang sudah hidup di Aqua lama tetap di sana. `ship()` tidak
/// memindahkan token, jadi tidak ada dana yang tertinggal atau terjebak — yang
/// tertinggal cuma catatan alokasi yang tidak lagi dibaca siapa pun. Menutupnya
/// opsional, dan tidak mengubah saldo dompet sedikit pun.
contract MigrateToOfficialAqua is Script, IqiaOpcodes {
    using ProgramBuilder for Program;

    /// @dev Sama dengan yang dipakai posisi tabungan di aplikasi.
    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.0025e9;

    constructor() IqiaOpcodes(vm.envAddress("AQUA")) { }

    /**
     * @dev Dua jalur penandatanganan, dan yang pertama yang seharusnya dipakai.
     *
     *   `MAKER` diisi  → keystore Foundry (`--account`). Kunci privatnya tetap
     *                    terenkripsi di disk, tidak pernah masuk variabel
     *                    lingkungan, riwayat shell, atau layar siapa pun.
     *   `DESK_KEY` diisi → kunci mentah. Masih didukung untuk anvil dan CI, di
     *                    mana kuncinya memang publik dan tak bernilai.
     */
    function run() external {
        address maker = vm.envOr("MAKER", address(0));
        uint256 key = maker == address(0) ? vm.envUint("DESK_KEY") : 0;
        if (maker == address(0)) maker = vm.addr(key);

        IAqua aqua = IAqua(vm.envAddress("AQUA"));
        address weth = vm.envAddress("WETH_ADDR");
        address usdc = vm.envAddress("USDC_ADDR");

        // Menolak lebih dulu, bukan gagal di tengah broadcast. Alamat tanpa kode
        // akan menerima `ship()` sebagai panggilan ke ketiadaan dan sukses
        // secara diam-diam — meninggalkan env yang menunjuk registry kosong.
        require(address(aqua).code.length > 0, "Aqua resmi tidak ada di rantai ini");

        uint256 wethBal = IERC20(weth).balanceOf(maker);
        uint256 usdcBal = IERC20(usdc).balanceOf(maker);
        require(wethBal > 0 && usdcBal > 0, "maker butuh WETH dan USDC. Cetak dulu di halaman Faucet.");

        console.log("maker            ", maker);
        console.log("Aqua resmi       ", address(aqua));
        console.log("WETH di dompet   ", wethBal);
        console.log("USDC di dompet   ", usdcBal);
        console.log("");

        if (key == 0) vm.startBroadcast();
        else vm.startBroadcast(key);

        // `weth = address(0)`: pembungkusan otomatis dimatikan. Token WETH kita
        // mock ERC20 biasa, bukan WETH9 — memberi alamatnya di sini akan membuat
        // router memanggil `withdraw()` pada kontrak yang tidak punya fungsi itu.
        IqiaSwapVMRouter router = new IqiaSwapVMRouter(address(aqua), address(0), maker);

        // Izin ke registry BARU. Yang lama tidak berlaku di sini, dan tanpa ini
        // `SolvencyGuard` membaca sandaran nol lalu memberi harga terburuknya
        // pada tiap swap — posisinya hidup tapi tak seorang pun mau memakainya.
        IERC20(weth).approve(address(aqua), type(uint256).max);
        IERC20(usdc).approve(address(aqua), type(uint256).max);

        bytes32 h = aqua.ship(
            address(router),
            abi.encode(_order(maker, _program(uint64(block.timestamp)))),
            dynamic([weth, usdc]),
            dynamic([wethBal, usdcBal])
        );
        vm.stopBroadcast();

        // Inti Aqua, dipatok sebagai syarat dan bukan sebagai klaim di dokumen.
        require(IERC20(weth).balanceOf(maker) == wethBal, "ship TIDAK BOLEH memindahkan token");
        require(IERC20(usdc).balanceOf(maker) == usdcBal, "ship TIDAK BOLEH memindahkan token");

        console.log("router baru      ", address(router));
        console.log("strategyHash     ", vm.toString(h));
        console.log("saldo sesudahnya : tidak bergerak sedikit pun");
        console.log("");
        console.log(string.concat("VITE_AQUA=", vm.toString(address(aqua))));
        console.log(string.concat("VITE_SWAP_VM_ROUTER=", vm.toString(address(router))));
    }

    /// @dev Program tabungan: penjaga solvensi, fee maker, kurva, salt.
    ///   Urutannya penting — `solvencyGuard` harus mendahului instruksi yang
    ///   membentuk saldo, dan `flatFeeIn` harus mendahului kurva.
    function _program(uint64 saltValue) internal pure returns (bytes memory) {
        Program memory p = ProgramBuilder.init(_opcodes());
        return bytes.concat(
            p.build(SolvencyGuard._solvencyGuardXD, SolvencyGuardArgsBuilder.build(SURCHARGE_BPS)),
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(FEE_BPS)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(saltValue))
        );
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
}
