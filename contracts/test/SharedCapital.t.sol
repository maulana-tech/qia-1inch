// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, console } from "forge-std/Test.sol";

import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

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

/// @notice Satu kantong modal, banyak pasar sekaligus.
///
/// @dev Ini properti Aqua yang tidak dimiliki AMM mana pun: `ship()` tidak
///   memindahkan token dan TIDAK memeriksa saldo, jadi 10 WETH yang sama bisa
///   didaftarkan sebagai likuiditas di beberapa pasar berbeda pada saat yang
///   sama. Di Uniswap, 10 WETH-mu ada di SATU pool.
///
///   Itu juga berbahaya, dan di situlah `SolvencyGuard` punya alasan hidup:
///   begitu satu pasar menghabiskan sebagian modal bersama, pasar-pasar LAIN
///   ikut memburuk harganya secara otomatis — tanpa transaksi tambahan, tanpa
///   keeper, tanpa oracle. Mereka membaca dompet yang sama.
contract SharedCapitalTest is Test, IqiaOpcodes {
    using ProgramBuilder for Program;

    Aqua public immutable AQUA = new Aqua();

    IqiaSwapVMRouter public router;
    TokenMock public weth;
    TokenMock public usdc;
    TokenMock public dai;

    address public maker;
    address public taker;

    /// @dev Modal NYATA maker. Perhatikan: dipakai di tiga pasar sekaligus.
    uint256 constant REAL_WETH = 10e18;
    uint256 constant QUOTE_USDC = 35_000e18;
    uint256 constant SWAP_IN = 3_000e18;

    uint32 constant SURCHARGE_BPS = 0.05e9;
    uint32 constant FEE_BPS = 0.003e9;

    constructor() IqiaOpcodes(address(AQUA)) { }

    function setUp() public {
        maker = vm.addr(0xBEEF);
        taker = vm.addr(0xCAFE);
        weth = new TokenMock("Wrapped Ether", "WETH");
        usdc = new TokenMock("USD Coin", "USDC");
        dai = new TokenMock("Dai", "DAI");
        router = new IqiaSwapVMRouter(address(AQUA), address(0), address(this));

        deal(address(weth), maker, REAL_WETH);
        deal(address(usdc), maker, QUOTE_USDC);
        deal(address(dai), maker, QUOTE_USDC);

        vm.startPrank(maker);
        weth.approve(address(AQUA), type(uint256).max);
        usdc.approve(address(AQUA), type(uint256).max);
        dai.approve(address(AQUA), type(uint256).max);
        vm.stopPrank();
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

    function _order(bytes memory prog) internal view returns (ISwapVM.Order memory) {
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

    function _takerData() internal view returns (bytes memory) {
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

    function _ship(ISwapVM.Order memory o, address quote) internal {
        vm.prank(maker);
        AQUA.ship(address(router), abi.encode(o),
            dynamic([address(weth), quote]), dynamic([REAL_WETH, QUOTE_USDC]));
    }

    function _quote(ISwapVM.Order memory o, address quote) internal returns (uint256 out) {
        (, out,) = router.quote(o, quote, address(weth), SWAP_IN, _takerData());
    }

    /// @notice 10 WETH yang sama mengutip di tiga pasar sekaligus.
    function test_ModalYangSamaMenopangTigaPasar() public {
        ISwapVM.Order memory a = _order(_program(1));
        ISwapVM.Order memory b = _order(_program(2));
        ISwapVM.Order memory c = _order(_program(3));

        _ship(a, address(usdc));
        _ship(b, address(dai));
        _ship(c, address(usdc));

        assertEq(weth.balanceOf(maker), REAL_WETH, "ship tidak boleh memindahkan token");

        // Ketiganya mengutip dari modal NYATA yang sama.
        assertGt(_quote(a, address(usdc)), 0, "pasar A mengutip");
        assertGt(_quote(b, address(dai)), 0, "pasar B mengutip");
        assertGt(_quote(c, address(usdc)), 0, "pasar C mengutip");

        console.log("modal nyata WETH     ", REAL_WETH);
        console.log("terdaftar di 3 pasar ", REAL_WETH * 3);
    }

    /// @notice INTINYA: menukar di satu pasar memperburuk harga pasar lain.
    ///
    /// @dev Tanpa transaksi tambahan, tanpa keeper, tanpa oracle. Pasar lain
    ///   membaca dompet yang sama, dan dompet itu baru saja menipis.
    function test_SwapDiSatuPasarMengubahHargaPasarLain() public {
        ISwapVM.Order memory a = _order(_program(10));
        ISwapVM.Order memory b = _order(_program(11));
        _ship(a, address(usdc));
        _ship(b, address(dai));

        uint256 sebelum = _quote(b, address(dai));

        // Seseorang menukar di pasar A. Modal bersamanya berkurang.
        deal(address(usdc), taker, SWAP_IN);
        vm.startPrank(taker);
        usdc.approve(address(router), type(uint256).max);
        router.swap(a, address(usdc), address(weth), SWAP_IN, _takerData());
        vm.stopPrank();

        uint256 sesudah = _quote(b, address(dai));

        console.log("kutipan pasar B sebelum", sebelum);
        console.log("kutipan pasar B sesudah", sesudah);
        console.log("WETH tersisa di dompet ", weth.balanceOf(maker));

        assertLt(weth.balanceOf(maker), REAL_WETH, "modal bersama harus berkurang");
        assertLt(sesudah, sebelum, "pasar B harus ikut memburuk tanpa disentuh");
    }

    /// @notice Seberapa tajam efeknya saat modal bersama benar-benar terkuras.
    ///
    /// @dev Angka inilah yang membuat gagasannya terasa: makin sedikit yang
    ///   tersisa di dompet, makin mahal harga di SEMUA pasar yang menopang
    ///   diri pada dompet itu. Modal bersama tidak dibagi rata — ia direbut,
    ///   dan yang datang belakangan membayar lebih.
    function test_MakinTipisModalnyaMakinMahalSemuaPasar() public {
        ISwapVM.Order memory b = _order(_program(20));
        _ship(b, address(dai));

        uint256 penuh = _quote(b, address(dai));
        console.log("dompet 10.0 WETH -> kutipan", penuh);

        uint256[3] memory sisa = [uint256(5e18), 2e18, 1e18];
        for (uint256 i = 0; i < sisa.length; i++) {
            deal(address(weth), maker, sisa[i]);
            uint256 q = _quote(b, address(dai));
            console.log("dompet tersisa            ", sisa[i]);
            console.log("   kutipan jadi           ", q);
            assertLt(q, penuh, "makin tipis harus makin buruk");
        }
    }
}
