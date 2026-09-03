// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Calldata } from "@1inch/solidity-utils/contracts/libraries/Calldata.sol";

import { Context, ContextLib } from "@1inch/swap-vm/src/libs/VM.sol";

uint256 constant BPS = 1e9;

library SolvencyGuardArgsBuilder {
    error SolvencyGuardSurchargeOutOfRange(uint32 maxSurchargeBps);

    /// @param maxSurchargeBps Biaya tambahan saat sandaran nyata maker nol.
    ///   Harus di bawah BPS (1e9): pada BPS penuh, jalur exact-out membagi nol.
    function build(uint32 maxSurchargeBps) internal pure returns (bytes memory) {
        require(maxSurchargeBps < BPS, SolvencyGuardSurchargeOutOfRange(maxSurchargeBps));
        return abi.encodePacked(maxSurchargeBps);
    }
}

/// @title SolvencyGuard
/// @notice Instruksi SwapVM: harga menyesuaikan berapa banyak sandaran nyata
///   yang masih dimiliki maker.
///
/// # Masalah yang diselesaikan
///
/// `Aqua.ship()` tidak mengecek saldo dompet sama sekali — dia hanya mencatat
/// izin. Itu memang inti efisiensi modalnya: satu dompet berisi 10 WETH bisa
/// menopang tiga strategi sekaligus, dan modalnya tidak pernah terkunci.
///
/// Tapi tidak ada yang menjaga sisi baliknya. Kalau dua strategi terkuras lebih
/// dulu, `pull()` pada strategi ketiga gagal di `transferFrom` — revert mentah.
/// Taker sudah membayar gas, tidak dapat apa-apa, dan order itu tampak rusak
/// padahal tidak ada yang salah secara logika.
///
/// # Cara kerjanya
///
/// Sebelum kurva harga dijalankan, instruksi ini membaca sandaran nyata maker
/// untuk `tokenOut`:
///
///     sandaran = min(saldo dompet maker, izin maker ke Aqua)
///
/// Lalu dibandingkan dengan saldo virtual yang tercatat di Aqua. Kalau sandaran
/// sudah lebih kecil, selisihnya menjadi biaya tambahan yang sebanding:
///
///     kekurangan   = (virtual - sandaran) / virtual
///     tambahanBps  = maxSurchargeBps * kekurangan
///
/// Efeknya harga memburuk secara bertahap seiring menipisnya sandaran, dan
/// maker mendapat kompensasi atas risiko yang meningkat.
///
/// # Batasnya
///
/// Instruksi ini membuat penipisan menjadi MAHAL, bukan mustahil. Kalau
/// `amountOut` yang diminta tetap melebihi isi dompet maker, `pull()` tetap
/// gagal di `transferFrom` — tidak ada instruksi yang bisa memunculkan token
/// yang tidak ada. Yang berubah: swap berukuran wajar tetap terlayani dengan
/// harga yang menyesuaikan, alih-alih semua ukuran ditolak sama rata.
///
/// Tidak ada instruksi bawaan SwapVM yang membaca saldo dompet maker. Semua
/// pemanggilan `balanceOf` di sana mengarah ke taker atau `tx.origin`.
///
/// # Penempatan
///
/// Harus diletakkan SEBELUM instruksi kurva, sama seperti instruksi fee. Ia
/// membungkus sisa program lewat `runLoop()`, jadi urutan menentukan apakah
/// biaya tambahan dihitung terhadap besaran sebelum atau sesudah kurva.
///
/// # Invarian
///
/// Bentuk penerapannya sengaja meniru `Fee._flatFeeAmountInXD` persis:
/// exact-in mengurangi `amountIn` sebelum `runLoop`, exact-out menambahnya
/// sesudah. Dengan begitu simetri exact-in/exact-out dan pembulatan yang
/// berpihak pada maker tetap terjaga.
contract SolvencyGuard {
    using Calldata for bytes;
    using ContextLib for Context;

    IERC20 private immutable _SOLVENCY_AQUA;

    error SolvencyGuardMissingSurchargeArg();
    error SolvencyGuardShouldRunBeforeSwap();
    error SolvencyGuardMakerHasNoBacking(address maker, address token);

    constructor(address aqua) {
        _SOLVENCY_AQUA = IERC20(aqua);
    }

    /// @dev Sandaran nyata maker untuk satu token: yang benar-benar bisa ditarik
    ///   Aqua saat ini. Izin ikut dihitung karena maker bisa mencabutnya kapan
    ///   saja tanpa menyentuh saldo.
    function _makerBacking(address maker, address token) internal view returns (uint256) {
        uint256 balance = IERC20(token).balanceOf(maker);
        uint256 allowed = IERC20(token).allowance(maker, address(_SOLVENCY_AQUA));
        return balance < allowed ? balance : allowed;
    }

    /// @dev Biaya tambahan berdasarkan kekurangan sandaran. Nol saat tertutup penuh.
    function _surchargeBps(Context memory ctx, uint32 maxSurchargeBps) internal view returns (uint256) {
        uint256 virtualBalance = ctx.swap.balanceOut;
        if (virtualBalance == 0) return 0;

        uint256 backing = _makerBacking(ctx.query.maker, ctx.query.tokenOut);
        require(backing > 0, SolvencyGuardMakerHasNoBacking(ctx.query.maker, ctx.query.tokenOut));

        if (backing >= virtualBalance) return 0;

        // maxSurchargeBps < BPS dijamin oleh builder, jadi hasilnya juga < BPS
        // dan pembagian pada jalur exact-out tidak pernah nol.
        return maxSurchargeBps * (virtualBalance - backing) / virtualBalance;
    }

    /// @dev args.maxSurchargeBps | 4 byte
    ///
    /// @dev Linter menandai cast di bawah sebagai berpotensi memotong nilai. Tidak
    ///   di sini: sumbernya tepat 4 byte dan tujuannya uint32, jadi lebarnya sama
    ///   persis. Pola yang sama dipakai `Fee.parseFlatFee` milik SwapVM.
    function _solvencyGuardXD(Context memory ctx, bytes calldata args) internal {
        uint32 maxSurchargeBps = uint32(bytes4(args.slice(0, 4, SolvencyGuardMissingSurchargeArg.selector)));
        require(ctx.swap.amountIn == 0 || ctx.swap.amountOut == 0, SolvencyGuardShouldRunBeforeSwap());

        uint256 surcharge = _surchargeBps(ctx, maxSurchargeBps);
        if (surcharge == 0) {
            ctx.runLoop();
            return;
        }

        if (ctx.query.isExactIn) {
            // Kecilkan amountIn yang masuk ke kurva, lalu kembalikan angka asli
            // supaya taker tetap membayar sebesar yang ia tetapkan.
            uint256 takerDefinedAmountIn = ctx.swap.amountIn;
            ctx.swap.amountIn -= Math.ceilDiv(ctx.swap.amountIn * surcharge, BPS);
            ctx.runLoop();
            ctx.swap.amountIn = takerDefinedAmountIn;
        } else {
            // Kurva menentukan amountIn dulu, baru ditambah biayanya.
            ctx.runLoop();
            ctx.swap.amountIn += Math.ceilDiv(ctx.swap.amountIn * surcharge, BPS - surcharge);
        }
    }
}
