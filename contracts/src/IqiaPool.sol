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
    // Order Settlement
    //
    // TIDAK AKTIF. Jalur ini dulu menerima hasil pencocokan dari enclave tepercaya
    // dan mempercayainya lewat tanda tangan enclave. Enclave itu infrastruktur milik
    // chain lama dan sudah dibuang, jadi `teeAddress` tidak akan pernah terisi dan
    // `settle()` selalu gagal di pemeriksaan tanda tangan.
    //
    // Penggantinya adalah SwapVM: aturan yang dulu dijaga enclave secara rahasia
    // menjadi program bytecode yang dijalankan on-chain, dan order bersandar Aqua
    // tidak butuh tanda tangan sama sekali. Kode di bawah dipertahankan sebagai
    // rujukan bentuk data sampai router SwapVM terpasang — lihat migrasi.md.
    // -------------------------------------------------------------------------

    address public teeAddress; // Set by governance/admin
    
    event OrderMatched(
        bytes32 indexed orderA,
        bytes32 indexed orderB,
        bytes32[] leafCommitments,
        uint32[] leafIndices,
        bytes[] leafMemos,
        bytes32[] residualCommitments,
        bytes[] residualMemos
    );

    function setTeeAddress(address _teeAddress) external {
        // TODO: add access control (onlyOwner)
        teeAddress = _teeAddress;
    }

    function settle(
        bytes32 _actionId,
        bytes calldata _submissionTag,
        uint8 _status,
        bytes calldata _resultData,
        bytes calldata _signature
    ) external {
        if (_status != 1) revert("status must be success");

        // Verify TEE Signature
        bytes32 resultHash = keccak256(abi.encodePacked(
            keccak256(_resultData), _actionId, keccak256(_submissionTag), _status
        ));
        
        bytes32 payloadHash = keccak256(abi.encode(bytes32("TEE_ACTION_RESULT"), block.chainid, resultHash));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payloadHash));
        
        address signer = _recover(ethSignedMessageHash, _signature);
        require(signer != address(0) && signer == teeAddress, "bad TEE signature");

        // Decode matched result (must match Go ABI encoding)
        (
            bytes32 orderA,
            bytes32 orderB,
            bytes32[] memory leafCommitments,
            bytes[] memory leafMemos,
            bytes32[] memory residualCommitments,
            bytes[] memory residualMemos
        ) = abi.decode(_resultData, (bytes32, bytes32, bytes32[], bytes[], bytes32[], bytes[]));
        
        // Nullify the matched orders
        if (nullifiers[orderA]) revert NullifierUsed();
        if (nullifiers[orderB]) revert NullifierUsed();
        nullifiers[orderA] = true;
        nullifiers[orderB] = true;

        // Insert new commitments (settlement fills / refunds) into tree
        uint32[] memory leafIndices = new uint32[](leafCommitments.length);
        for (uint256 i = 0; i < leafCommitments.length; i++) {
            leafIndices[i] = _insert(leafCommitments[i]);
        }
        
        emit OrderMatched(
            orderA, orderB,
            leafCommitments, leafIndices, leafMemos,
            residualCommitments, residualMemos
        );
    }

    function _recover(bytes32 hash, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }
}
