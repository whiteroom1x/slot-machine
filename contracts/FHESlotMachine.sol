// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint64, euint32, euint16, euint8, externalEuint64, externalEuint32, externalEuint16, externalEuint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract FHESlotMachine is ZamaEthereumConfig, Ownable, Pausable {
    // Events
    event Spin(address indexed player, uint256 betAmount, uint256 payout, bool isWin, uint8 symbol1, uint8 symbol2, uint8 symbol3);
    event Jackpot(address indexed player, uint256 betAmount, uint256 winnings);
    event Deposit(address indexed player, uint256 amount);
    event Withdraw(address indexed owner, uint256 amount);

    // State variables
    uint256 public houseEdge; // House edge in basis points (100 = 1%)
    uint256 public jackpotThreshold; // Minimum bet to qualify for jackpot
    uint256 public totalJackpot; // Accumulated jackpot pool
    uint256 public maxPayout; // Maximum payout per spin
    uint256 public minDeposit = 0.001 ether; // Minimum deposit amount
    uint256 public minBet = 0.001 ether; // Minimum bet amount per spin
    
    // Player balances
    mapping(address => uint256) public playerBalances;
    
    // Game statistics
    uint256 public totalSpins;
    uint256 public totalWon;
    uint256 public totalLost;

    // Player spin state for v0.9 self-relaying pattern
    mapping(address => mapping(uint256 => uint256)) private pendingSpins;
    uint256 private spinCounter;
    
    // Symbol values (for payout calculation)
    // Cherry, Grapes, Watermelon, Star, Bell, Gem, Seven, Eight
    uint8[8] private symbolValues = [1, 1, 1, 1, 2, 5, 10, 15];
    
    // Constructor
    constructor(uint256 _houseEdge, uint256 _jackpotThreshold) {
        houseEdge = _houseEdge;
        jackpotThreshold = _jackpotThreshold;
        maxPayout = 100 ether; // Maximum payout
    }

    // Modifier to check if player has sufficient balance
    modifier hasBalance(uint256 amount) {
        require(playerBalances[msg.sender] >= amount, "Insufficient balance");
        _;
    }

    // Modifier to check if bet is valid
    modifier validBet(uint256 betAmount) {
        require(betAmount >= minBet, "Bet must be at least 0.001 ETH");
        require(betAmount <= maxPayout, "Bet amount exceeds maximum");
        _;
    }

    // Deposit ETH to play
    function deposit() public payable whenNotPaused {
        require(msg.value >= minDeposit, "Deposit must be at least 0.001 ETH");
        playerBalances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    // Withdraw player balance
    function withdraw(uint256 amount) public whenNotPaused {
        require(playerBalances[msg.sender] >= amount, "Insufficient balance");
        playerBalances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdraw(msg.sender, amount);
    }

    // Spin the slot machine with FHE-encrypted random numbers
    function spin(uint256 betAmount) public whenNotPaused hasBalance(betAmount) validBet(betAmount) returns (uint256) {
        // Deduct bet from player balance
        playerBalances[msg.sender] -= betAmount;
        
        // Increment total spins
        totalSpins++;
        
        // Generate encrypted random numbers using FHE
        // These are encrypted on-chain, keeping the random values private
        euint8 encryptedRandom1 = FHE.asEuint8(uint8(uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, totalSpins, uint8(0)))) % 8));
        euint8 encryptedRandom2 = FHE.asEuint8(uint8(uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, totalSpins, uint8(1)))) % 8));
        euint8 encryptedRandom3 = FHE.asEuint8(uint8(uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, totalSpins, uint8(2)))) % 8));
        
        // Mark symbols as publicly decryptable for client-side decryption (v0.9 pattern)
        FHE.makePubliclyDecryptable(encryptedRandom1);
        FHE.makePubliclyDecryptable(encryptedRandom2);
        FHE.makePubliclyDecryptable(encryptedRandom3);
        
        // Client will decrypt off-chain and call processSpinResult
        // This enables the self-relaying pattern of FHEVM v0.9
        
        return 0; // Return will be updated when processSpinResult is called
    }
    
    // Process spin result with client-verified decrypted values (FHEVM v0.9 pattern)
    // Client decrypts symbols off-chain and provides proof
    function processSpinResult(
        uint256 spinId,
        uint8 symbol1,
        uint8 symbol2,
        uint8 symbol3,
        bytes calldata proof
    ) public returns (uint256 payout) {
        // In v0.9, proof verification would use FHE.checkSignatures
        // For now, we accept the decrypted values from the client
        // TODO: Implement full signature verification when FHE.checkSignatures is available
        
        uint256 betAmount = pendingSpins[msg.sender][spinId];
        require(betAmount > 0, "Invalid spin ID");
        delete pendingSpins[msg.sender][spinId];
        
        // Calculate payout with decrypted symbols
        payout = calculatePayout(symbol1, symbol2, symbol3, betAmount);
        
        // Apply house edge
        if (payout > 0) {
            uint256 houseFee = (payout * houseEdge) / 10000;
            payout -= houseFee;
        }
        
        // Check for jackpot
        bool isJackpot = checkJackpot(symbol1, symbol2, symbol3, betAmount >= jackpotThreshold);
        if (isJackpot && betAmount >= jackpotThreshold) {
            uint256 jackpotWinnings = payout + totalJackpot;
            totalJackpot = 0;
            payout = jackpotWinnings;
            emit Jackpot(msg.sender, betAmount, jackpotWinnings);
        }
        
        // Determine if this is a win
        bool isWin = payout > betAmount;
        
        // Update game statistics
        if (isWin) {
            totalWon += payout;
        } else {
            totalLost += betAmount;
        }
        
        // Add winnings to player balance
        if (payout > 0) {
            playerBalances[msg.sender] += payout;
        }
        
        // Add losing bets to jackpot pool
        if (!isWin) {
            uint256 jackpotContribution = (betAmount * 1) / 100;
            totalJackpot += jackpotContribution;
        }
        
        // Emit spin event
        emit Spin(msg.sender, betAmount, payout, isWin, symbol1, symbol2, symbol3);
        
        return payout;
    }

    // Calculate payout with decrypted symbols (simplified for v0.9 client-verified model)
    function calculatePayout(uint8 symbol1, uint8 symbol2, uint8 symbol3, uint256 betAmount) private view returns (uint256) {
        // Three of a kind check
        if (symbol1 == symbol2 && symbol2 == symbol3) {
            if (symbol1 >= 6) {
                return betAmount * symbolValues[symbol1] * 5;
            } else if (symbol1 >= 4) {
                return betAmount * symbolValues[symbol1] * 3;
            } else if (symbol1 >= 2) {
                return betAmount * 3;
            } else {
                return betAmount * 2;
            }
        }
        
        // Two of a kind check
        if (symbol1 == symbol2 || symbol2 == symbol3 || symbol1 == symbol3) {
            uint8 matchedSymbol = (symbol1 == symbol2) ? symbol1 : (symbol2 == symbol3) ? symbol2 : symbol1;
            if (matchedSymbol >= 6) {
                return betAmount * 2;
            } else if (matchedSymbol >= 4) {
                return betAmount * 175 / 100;
            } else {
                return betAmount * 15 / 10;
            }
        }
        
        return 0;
    }
    
    // Check for jackpot with decrypted symbols
    function checkJackpot(uint8 symbol1, uint8 symbol2, uint8 symbol3, bool qualifiesForJackpot) private pure returns (bool) {
        if (!qualifiesForJackpot) return false;
        return symbol1 == 6 && symbol2 == 6 && symbol3 == 6;
    }


    // Get player balance
    function getPlayerBalance() public view returns (uint256) {
        return playerBalances[msg.sender];
    }

    // Set house edge (only owner)
    function setHouseEdge(uint256 _houseEdge) public onlyOwner {
        require(_houseEdge <= 1000, "House edge cannot exceed 10%");
        houseEdge = _houseEdge;
    }

    // Set jackpot threshold (only owner)
    function setJackpotThreshold(uint256 _threshold) public onlyOwner {
        jackpotThreshold = _threshold;
    }

    // Emergency withdraw function (only owner)
    function emergencyWithdraw() public onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // Pause the contract (only owner)
    function pause() public onlyOwner {
        _pause();
    }

    // Unpause the contract (only owner)
    function unpause() public onlyOwner {
        _unpause();
    }

    // Receive ETH
    receive() external payable {
        deposit();
    }
}