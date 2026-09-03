// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPoseidon {
    function hash(uint256[2] memory inputs) external view returns (uint256);
}

interface IWithdrawVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

contract IqiaPool {
    uint32 public constant TREE_DEPTH = 20;
    uint32 public constant MAX_LEAVES = uint32(1 << TREE_DEPTH);
    uint32 public constant ROOT_HISTORY = 100;

    IPoseidon public immutable poseidon;
    IWithdrawVerifier public immutable withdrawVerifier;
    
    uint32 public nextIndex;
    
    // Circular buffer for root history to avoid unbounded array growth
    bytes32[ROOT_HISTORY] public roots;
    uint32 public currentRootIndex;
    
    mapping(uint32 => bytes32) public frontier;
    mapping(bytes32 => bool) public nullifiers;

    event Deposit(uint32 indexed index, bytes32 commitment, address asset, uint256 amount);
    event Withdraw(bytes32 indexed nullifier, address recipient, address asset, uint256 amount);

    error TreeFull();
    error NullifierUsed();
    error InvalidRoot();
    error VerificationFailed();
    error TransferFailed();
    error BadEthValue();

    constructor(address _poseidon, address _withdrawVerifier) {
        emit OwnerTransferred(address(0), msg.sender);
        owner = msg.sender;
        poseidon = IPoseidon(_poseidon);
        withdrawVerifier = IWithdrawVerifier(_withdrawVerifier);
        
        // Initialize the empty tree root
        // In a real deployment, we'd precompute the zero hashes and store the empty root
    }

    function _hash2(bytes32 left, bytes32 right) internal view returns (bytes32) {
        uint256[2] memory inputs = [uint256(left), uint256(right)];
        return bytes32(poseidon.hash(inputs));
    }

    // Ported from insert() in merkle.rs
    function _insert(bytes32 leaf) internal returns (uint32) {
        if (nextIndex >= MAX_LEAVES) revert TreeFull();
        
        uint32 idx = nextIndex;
        bytes32 current = leaf;
        
        for (uint32 i = 0; i < TREE_DEPTH; i++) {
            uint32 bit = (idx >> i) & 1;
            if (bit == 0) {
                frontier[i] = current;
                // We should hash with the precomputed zero hash for level `i`.
                // For now, using bytes32(0) as a mock until zero hashes are injected.
                current = _hash2(current, bytes32(0));
            } else {
                bytes32 left = frontier[i];
                current = _hash2(left, current);
            }
        }

        _pushRoot(current);
        nextIndex = idx + 1;
        return idx;
    }

    function _pushRoot(bytes32 newRoot) internal {
        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY;
        roots[currentRootIndex] = newRoot;
    }

    function isKnownRoot(bytes32 root) public view returns (bool) {
        // Check the circular buffer
        for (uint32 i = 0; i < ROOT_HISTORY; i++) {
            if (roots[i] == root) return true;
        }
        return false;
    }

    function deposit(bytes32 commitment, address asset, uint256 amount) external payable {
        if (asset == address(0)) {
            if (msg.value != amount) revert BadEthValue();
        } else {
            if (msg.value != 0) revert BadEthValue();
            _safeTransferFrom(asset, msg.sender, address(this), amount);
        }

        uint32 index = _insert(commitment);
        emit Deposit(index, commitment, asset, amount);
    }

    function withdraw(
        bytes calldata proof,
        bytes32 merkleRoot,
        bytes32 nullifier,
        address recipient,
        uint256 amount,
        address asset
    ) external {
        if (nullifiers[nullifier]) revert NullifierUsed();
        if (!isKnownRoot(merkleRoot)) revert InvalidRoot();

        // Prepare public inputs in EXACT order expected by the Noir circuit:
        // merkle_root, nullifier, recipient_hash, amount, asset_id
        bytes32[] memory publicInputs = new bytes32[](5);
        publicInputs[0] = merkleRoot;
        publicInputs[1] = nullifier;
        publicInputs[2] = bytes32(uint256(uint160(recipient))); // recipient address mapped to field
        publicInputs[3] = bytes32(amount);
        publicInputs[4] = bytes32(uint256(uint160(asset)));     // asset address mapped to field

        if (!withdrawVerifier.verify(proof, publicInputs)) {
            revert VerificationFailed();
        }

        // Mark as spent BEFORE interaction to prevent re-entrancy
        nullifiers[nullifier] = true;

        if (asset == address(0)) {
            (bool ok, ) = payable(recipient).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            _safeTransfer(asset, recipient, amount);
        }

        emit Withdraw(nullifier, recipient, asset, amount);
    }

    // -------------------------------------------------------------------------
    // Internal: defensive ERC20 transfers
    // -------------------------------------------------------------------------

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    // -------------------------------------------------------------------------
    // Meja likuiditas Aqua
    //
    // Menggantikan jalur penyelesaian lama, yang dulu menerima hasil pencocokan
    // dari enclave tepercaya dan mempercayainya lewat tanda tangan. Enclave itu
    // milik infrastruktur chain lama dan sudah dibuang bersama seluruh lapisannya.
    //
    // Gantinya bukan sekadar tanda tangan yang lain, melainkan mesin virtual:
    // aturan yang dulu dijaga enclave secara rahasia sekarang menjadi program
    // bytecode SwapVM yang dijalankan on-chain, dan likuiditasnya bersandar pada
    // Aqua sehingga tidak pernah meninggalkan dompet market maker.
    // -------------------------------------------------------------------------

    /// @notice Boleh menunjuk meja dan memicu penyeimbangan.
    address public owner;

    /// @notice Perantara menuju router SwapVM. Lihat IqiaAquaTaker.
    address public desk;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event DeskUpdated(address indexed previousDesk, address indexed newDesk);
    event Rebalanced(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    error NotOwner(address caller);
    error DeskNotSet();
    error ApprovalFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    /// @dev Alamat nol ditolak: itu akan mematikan setDesk dan rebalance selamanya.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert NotOwner(newOwner);
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Menunjuk perantara yang berhak membelanjakan aset kolam saat rebalance.
    /// @dev Izin lama dicabut lebih dulu supaya meja yang sudah diganti tidak
    ///   menyisakan hak belanja atas dana kolam.
    function setDesk(address newDesk) external onlyOwner {
        emit DeskUpdated(desk, newDesk);
        desk = newDesk;
    }

    /// @notice Menyeimbangkan komposisi aset kolam lewat meja Aqua.
    ///
    /// @dev Kolam menerima apa pun yang disetor pengguna, tapi penarikan bisa
    ///   meminta aset lain. Kalau komposisinya menyimpang, kolam perlu menukar
    ///   sebagian isinya. Penukaran itu lewat meja Aqua, bukan AMM publik: harga
    ///   datang dari market maker yang dananya tidak pernah terkunci, dan gerbang
    ///   di program mereka membatasi siapa yang boleh mengisi.
    ///
    /// @dev CAKUPAN: ini operasi tingkat kolam. Dia mengubah isi kolam, bukan
    ///   catatan note siapa pun. Swap terlindung per pengguna menuntut sirkuit
    ///   yang membatasi nilai commitment keluaran, dan sirkuit itu belum ada —
    ///   lihat docs/migrasi.md. Memakai ulang sirkuit `withdraw` untuk keperluan
    ///   ini TIDAK AMAN: nilai keluarannya tidak terbatasi, sehingga penyerang
    ///   bisa mengklaim commitment yang lebih besar daripada hasil swap.
    ///
    /// @param amount Pada exact-in jumlah masukan, pada exact-out jumlah keluaran
    /// @param maxAmountIn Batas atas token yang boleh dibelanjakan meja
    /// @param minAmountOut Ambang slippage
    function rebalance(
        bytes calldata order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 maxAmountIn,
        uint256 minAmountOut,
        bytes calldata takerTraitsAndData
    ) external onlyOwner returns (uint256 amountIn, uint256 amountOut) {
        address desk_ = desk;
        if (desk_ == address(0)) revert DeskNotSet();

        // Izin diberikan tepat sebesar kebutuhan dan dicabut lagi setelahnya,
        // jadi meja tidak pernah memegang hak belanja di luar satu transaksi.
        _approve(tokenIn, desk_, maxAmountIn);
        (amountIn, amountOut) = IIqiaDesk(desk_).swapForPool(
            order, tokenIn, tokenOut, amount, maxAmountIn, minAmountOut, takerTraitsAndData
        );
        _approve(tokenIn, desk_, 0);

        emit Rebalanced(tokenIn, tokenOut, amountIn, amountOut);
    }

    function _approve(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert ApprovalFailed();
    }
}

/// @notice Bagian dari IqiaAquaTaker yang dipakai kolam.
/// @dev Dideklarasikan di sini supaya kolam tidak perlu mengimpor seluruh tumpukan
///   SwapVM. `order` dilewatkan sebagai bytes mentah dan diteruskan apa adanya.
interface IIqiaDesk {
    function swapForPool(
        bytes calldata order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 maxAmountIn,
        uint256 minAmountOut,
        bytes calldata takerTraitsAndData
    ) external returns (uint256 amountIn, uint256 amountOut);
}
