// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { XYCSwap } from "@1inch/swap-vm/src/instructions/XYCSwap.sol";
import { Controls } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { Fee, FeeArgsBuilder } from "@1inch/swap-vm/src/instructions/Fee.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { Program, ProgramBuilder } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import { dynamic } from "@1inch/swap-vm/test/utils/Dynamic.sol";

import { MockERC20 } from "../src/MockERC20.sol";
import { IqiaSwapVMRouter } from "../src/iqia/IqiaSwapVMRouter.sol";
import { IqiaOpcodes } from "../src/iqia/IqiaOpcodes.sol";
import { SolvencyGuard, SolvencyGuardArgsBuilder } from "../src/iqia/instructions/SolvencyGuard.sol";

/// @notice Menambah dua pasar ke deployment yang SUDAH ADA, dengan modal yang sama.
///
/// @dev Tidak men-deploy Aqua maupun router — keduanya dibaca dari env, jadi
///   posisi baru ini menumpuk di atas yang sudah kamu kirim, bukan menggantinya.
///
///   Tiap posisi mendaftarkan SELURUH saldo WETH maker, bukan sebagian. Itu
///   bukan kecerobohan: `ship()` tidak memindahkan token dan tidak memeriksa
///   saldo, jadi seluruh tumpukan bisa mengutip di setiap pasar sekaligus. Yang
///   menjaganya tetap waras adalah `SolvencyGuard` — begitu satu pasar
///   menghabiskan sebagian modal bersama, pasar lain ikut memburuk harganya.
///
///   Token sisi lawan di-deploy di luar skrip ini (lihat script/add-markets.sh):
///   `forge script` gagal menguraikan argumen konstruktor yang mengandung
///   `string`, dan kegagalan itu membatalkan SELURUH broadcast.
contract AddMarkets is Script, IqiaOpcodes {
    using ProgramBuilder for Program;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.003e9;

    constructor() IqiaOpcodes(vm.envAddress("AQUA")) { }

    function run() external {
        uint256 key = vm.envUint("DESK_KEY");
        address maker = vm.addr(key);

        Aqua aqua = Aqua(vm.envAddress("AQUA"));
        address router = vm.envAddress("ROUTER");
        address weth = vm.envAddress("WETH_ADDR");
        address[2] memory quotes = [vm.envAddress("QUOTE_A"), vm.envAddress("QUOTE_B")];

        // Modal NYATA, dibaca dari rantai. Tidak ditulis mati.
        uint256 realWeth = IERC20(weth).balanceOf(maker);
        require(realWeth > 0, "maker tidak punya WETH. Cetak dulu lewat halaman Faucet.");

        uint256 quoteSize = 35_000 * (10 ** MockERC20(quotes[0]).decimals());

        console.log("maker            ", maker);
        console.log("WETH nyata       ", realWeth);
        console.log("");

        for (uint256 i = 0; i < quotes.length; i++) {
            uint64 saltValue = uint64(block.timestamp + i);

            vm.startBroadcast(key);
            MockERC20(quotes[i]).mint(maker, quoteSize);
            IERC20(weth).approve(address(aqua), type(uint256).max);
            IERC20(quotes[i]).approve(address(aqua), type(uint256).max);

            bytes32 h = aqua.ship(
                router,
                abi.encode(_order(maker, _program(saltValue))),
                dynamic([weth, quotes[i]]),
                dynamic([realWeth, quoteSize])
            );
            vm.stopBroadcast();

            console.log("pasar baru       ", MockERC20(quotes[i]).symbol());
            console.log("  strategyHash   ", vm.toString(h));
            console.log("  WETH terdaftar ", realWeth);
        }

        require(
            IERC20(weth).balanceOf(maker) == realWeth,
            "ship TIDAK BOLEH memindahkan token"
        );

        console.log("");
        console.log("WETH di dompet setelah semuanya:", IERC20(weth).balanceOf(maker));
        console.log("Tidak bergerak sedikit pun. Itu inti Aqua.");
        console.log("");
        console.log(string.concat("VITE_DAI_ADDRESS=", vm.toString(quotes[0])));
        console.log(string.concat("VITE_WBTC_ADDRESS=", vm.toString(quotes[1])));
    }

    function _program(uint64 saltValue) internal view returns (bytes memory) {
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
