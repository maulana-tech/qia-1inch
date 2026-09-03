// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { ITakerCallbacks } from "@1inch/swap-vm/src/interfaces/ITakerCallbacks.sol";

/// @title IqiaAquaTaker
/// @notice Jembatan yang membuat kolam terlindung bisa berperan sebagai taker
///   SwapVM, tanpa mengubah kontrak kolamnya sendiri.
///
/// # Kenapa perlu perantara
///
/// SwapVM memanggil balik takernya lewat `preTransferInCallback` untuk menagih
/// `tokenIn`. Artinya taker harus mengimplementasikan `ITakerCallbacks` dan
/// memegang token saat callback itu tiba. Menanamkan kewajiban itu ke dalam
/// kolam berarti menambah permukaan serang pada kontrak yang memegang seluruh
/// dana pengguna.
///
/// Perantara ini memisahkan keduanya. Kolam cukup memberi izin dan memanggil
/// satu fungsi; seluruh urusan protokol tinggal di sini. Kalau ada yang salah,
/// yang terekspos hanya token yang sedang lewat dalam satu transaksi.
///
/// # Alur satu swap
///
///   1. kolam memanggil `swapForPool`
///   2. perantara menarik `tokenIn` dari kolam
///   3. perantara memanggil `router.swap`
///   4. SwapVM memanggil balik `preTransferInCallback`
///   5. perantara mendorong `tokenIn` ke maker lewat Aqua
///   6. Aqua menarik `tokenOut` dari dompet maker ke perantara
///   7. perantara meneruskan `tokenOut` ke kolam, plus sisa `tokenIn` bila ada
///
/// @dev Perantara ini tidak menyimpan saldo antar transaksi. Kalau ada token
///   tersangkut karena hal di luar dugaan, `sweep` mengembalikannya ke kolam —
///   ke kolam saja, bukan ke alamat pilihan pemanggil.
contract IqiaAquaTaker is ITakerCallbacks {
    using SafeERC20 for IERC20;

    IAqua public immutable AQUA;
    ISwapVM public immutable ROUTER;
    /// @notice Satu-satunya pihak yang boleh memicu swap dan menerima hasilnya.
    address public immutable POOL;

    error IqiaTakerZeroAddress();
    error IqiaTakerOnlyPool(address caller);
    error IqiaTakerOnlyRouter(address caller);
    error IqiaTakerInsufficientOutput(uint256 amountOut, uint256 minAmountOut);
    error IqiaTakerExcessiveInput(uint256 amountIn, uint256 maxAmountIn);

    event SwappedForPool(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    modifier onlyPool() {
        require(msg.sender == POOL, IqiaTakerOnlyPool(msg.sender));
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == address(ROUTER), IqiaTakerOnlyRouter(msg.sender));
        _;
    }

    /// @dev Ketiganya immutable. Alamat nol membuat kontrak ini mati permanen —
    ///   tidak ada yang bisa memicu swap, dan tidak ada cara memperbaikinya.
    constructor(IAqua aqua, ISwapVM router, address pool) {
        require(
            address(aqua) != address(0) && address(router) != address(0) && pool != address(0),
            IqiaTakerZeroAddress()
        );
        AQUA = aqua;
        ROUTER = router;
        POOL = pool;
    }

    /// @notice Menjalankan satu swap atas nama kolam.
    /// @dev Kolam harus sudah memberi izin `tokenIn` kepada kontrak ini.
    ///
    /// @param amount Arti nilainya tergantung arah swap, mengikuti SwapVM:
    ///   pada exact-in ini jumlah MASUKAN, pada exact-out jumlah KELUARAN.
    ///   Karena itu `amount` tidak bisa dipakai untuk menentukan berapa tokenIn
    ///   yang perlu ditarik dari kolam — pada exact-out, masukan yang dibutuhkan
    ///   justru belum diketahui sebelum kurvanya dijalankan.
    /// @param maxAmountIn Berapa `tokenIn` yang boleh ditarik dari kolam.
    ///   Pada exact-in samakan dengan `amount`. Pada exact-out isi dengan batas
    ///   atas yang masih kolam terima; sisanya dikembalikan.
    /// @param minAmountOut Ambang slippage. Diperiksa di sini, bukan hanya
    ///   diserahkan ke threshold SwapVM, supaya kolam tetap terlindungi meski
    ///   taker data dirakit keliru.
    /// @param encodedOrder `abi.encode(ISwapVM.Order)`. Dilewatkan sebagai bytes
    ///   supaya kolam tidak perlu mengimpor seluruh tumpukan tipe SwapVM hanya
    ///   untuk meneruskan satu argumen.
    function swapForPool(
        bytes calldata encodedOrder,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 maxAmountIn,
        uint256 minAmountOut,
        bytes calldata takerTraitsAndData
    ) external onlyPool returns (uint256 amountIn, uint256 amountOut) {
        // msg.sender, bukan POOL: di dalam onlyPool keduanya identik, dan menulisnya
        // begini membuat sumber dananya terbaca langsung dari tanda tangan fungsinya.
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), maxAmountIn);

        ISwapVM.Order memory order = abi.decode(encodedOrder, (ISwapVM.Order));
        (amountIn, amountOut,) = ROUTER.swap(order, tokenIn, tokenOut, amount, takerTraitsAndData);
        require(amountOut >= minAmountOut, IqiaTakerInsufficientOutput(amountOut, minAmountOut));
        require(amountIn <= maxAmountIn, IqiaTakerExcessiveInput(amountIn, maxAmountIn));

        IERC20(tokenOut).safeTransfer(POOL, amountOut);

        if (amountIn < maxAmountIn) {
            IERC20(tokenIn).safeTransfer(POOL, maxAmountIn - amountIn);
        }

        // Event menyusul panggilan eksternal. Urutannya tidak bisa dibalik: jumlah
        // yang dicatat baru diketahui setelah swap dijalankan. Aman di sini karena
        // POOL dan ROUTER keduanya immutable dan tepercaya.
        emit SwappedForPool(tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @notice Dipanggil SwapVM untuk menagih `tokenIn` sebelum settlement.
    /// @dev Pembayaran lewat Aqua, bukan transfer langsung: Aqua yang mencatat
    ///   pertambahan saldo virtual maker sekaligus memindahkan tokennya.
    function preTransferInCallback(
        address maker,
        address /* taker */,
        address tokenIn,
        address /* tokenOut */,
        uint256 amountIn,
        uint256 /* amountOut */,
        bytes32 orderHash,
        bytes calldata /* takerData */
    ) external onlyRouter {
        IERC20(tokenIn).forceApprove(address(AQUA), amountIn);
        AQUA.push(maker, address(ROUTER), orderHash, tokenIn, amountIn);
    }

    /// @notice Tidak dipakai. Ada karena antarmukanya mewajibkan.
    function preTransferOutCallback(
        address, address, address, address, uint256, uint256, bytes32, bytes calldata
    ) external onlyRouter { }

    /// @notice Mengembalikan token yang tersangkut ke kolam.
    /// @dev Tujuannya dipatok ke POOL, jadi fungsi ini tidak bisa dipakai untuk
    ///   mengalihkan dana ke mana pun.
    function sweep(IERC20 token) external {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) token.safeTransfer(POOL, balance);
    }
}
