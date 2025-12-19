import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Head from 'next/head';
import { FaWallet, FaEthereum, FaGamepad, FaLock, FaShieldAlt, FaBalanceScale, FaCoins } from 'react-icons/fa';
import { GiDiceEightFacesEight, GiCherry, GiGrapes, GiWatermelon, GiStarFormation, GiBell, GiGemPendant, GiDiceSeven } from 'react-icons/gi';
import { IoMdRefresh, IoMdCash } from 'react-icons/io';
import { MdAccountBalanceWallet } from 'react-icons/md';

// Contract ABI loaded dynamically
let contractABI = null;
if (typeof window !== 'undefined') {
  // Load the ABI from public folder
  fetch('/FHESlotMachine.json')
    .then(res => res.json())
    .then(data => { contractABI = data; })
    .catch(err => console.error('Error loading contract ABI:', err));
}

export default function FHESlotMachine() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [balance, setBalance] = useState('0.0000');
  const [jackpot, setJackpot] = useState('0.0000');
  const [betAmount, setBetAmount] = useState('0.001');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositInput, setDepositInput] = useState('0.01');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawInput, setWithdrawInput] = useState('0.001');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [result, setResult] = useState({ message: 'Connect your wallet to play!', isWin: false });
  const [showConfetti, setShowConfetti] = useState(false);
  const [contractAddress, setContractAddress] = useState(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS);
  
  // Slot symbols
  const symbols = [
    { emoji: '🍒', color: 'cherry' },
    { emoji: '🍇', color: 'grapes' },
    { emoji: '🍉', color: 'watermelon' },
    { emoji: '⭐', color: 'star' },
    { emoji: '🔔', color: 'bell' },
    { emoji: '💎', color: 'gem' },
    { emoji: '7️⃣', color: 'seven' },
    { emoji: '8️⃣', color: 'eight' }
  ];
  
  // Initialize with first three symbols
  const [reels, setReels] = useState([symbols[0], symbols[1], symbols[2]]);
  const [spinningReels, setSpinningReels] = useState([false, false, false]);
  const [reelPositions, setReelPositions] = useState([0, 0, 0]); // For vertical scrolling
  const [reelSymbols, setReelSymbols] = useState([
    [symbols[0], symbols[1], symbols[2], symbols[3], symbols[4]], // Reel 1
    [symbols[1], symbols[2], symbols[3], symbols[4], symbols[5]], // Reel 2
    [symbols[2], symbols[3], symbols[4], symbols[5], symbols[6]]  // Reel 3
  ]);

  // Animate spinning with proper slot machine effect - spins until stopped
  const spinReels = () => {
    // Set all reels to spinning state
    setSpinningReels([true, true, true]);
    
    // Generate new symbol sequences for each reel
    const newReelSymbols = reels.map(() => {
      return Array.from({length: 10}, () => symbols[Math.floor(Math.random() * symbols.length)]);
    });
    setReelSymbols(newReelSymbols);
    
    // Store interval IDs so we can clear them later
    const intervalIds = [];
    
    // Spin each reel continuously until stopped
    for (let reelIndex = 0; reelIndex < 3; reelIndex++) {
      const reelSpinInterval = setInterval(() => {
        // Update the visual position for smooth scrolling
        setReelPositions(prev => {
          const newPositions = [...prev];
          newPositions[reelIndex] = newPositions[reelIndex] + 30;
          return newPositions;
        });
      }, 50);
      intervalIds.push(reelSpinInterval);
    }
    
    // Return interval IDs so they can be cleared when stopping
    return intervalIds;
  };

  // Stop all spinning reels with final symbols
  const stopReels = (finalSymbols, intervalIds) => {
    // Clear all spinning intervals
    intervalIds.forEach(id => clearInterval(id));
    
    // Set final symbols and stop spinning
    setReels(finalSymbols);
    setSpinningReels([false, false, false]);
  };

  // Initialize connection
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(provider);
    }
  }, []);

  // Update balance and jackpot when contract changes
  useEffect(() => {
    if (contract && isConnected) {
      updateBalance();
      updateJackpot();
    }
  }, [contract, isConnected]);

  // Update player balance
  const updateBalance = async () => {
    if (!contract || !signer) return;
    
    try {
      const balance = await contract.getPlayerBalance();
      setBalance(ethers.formatEther(balance));
    } catch (error) {
      console.error("Error updating balance:", error);
    }
  };

  // Update jackpot pool
  const updateJackpot = async () => {
    if (!contract) return;
    
    try {
      const jackpotAmount = await contract.totalJackpot();
      setJackpot(ethers.formatEther(jackpotAmount));
    } catch (error) {
      console.error("Error updating jackpot:", error);
    }
  };

  // Connect wallet
  const connectWallet = async () => {
    if (!provider) return;

    try {
      // Wait for contract ABI to load
      while (!contractABI) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      await provider.send("eth_requestAccounts", []);
      
      // Check if user is on Sepolia network (chainId: 11155111 = 0xaa36a7)
      const network = await provider.getNetwork();
      const sepoliaChainId = 11155111;
      
      if (network.chainId !== BigInt(sepoliaChainId)) {
        try {
          // Request to switch to Sepolia
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }], // Sepolia chainId in hex
          });
        } catch (switchError) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            try {
              // Add Sepolia network to MetaMask
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: '0xaa36a7',
                    chainName: 'Sepolia Test Network',
                    nativeCurrency: {
                      name: 'Sepolia ETH',
                      symbol: 'ETH',
                      decimals: 18,
                    },
                    rpcUrls: ['https://1rpc.io/sepolia'],
                    blockExplorerUrls: ['https://sepolia.etherscan.io'],
                  },
                ],
              });
            } catch (addError) {
              setResult({ message: 'Failed to add Sepolia network. Please add it manually.', isWin: false });
              return;
            }
          } else {
            setResult({ message: 'Please switch to Sepolia network in MetaMask.', isWin: false });
            return;
          }
        }
      }
      
      const signer = await provider.getSigner();
      setSigner(signer);
      setIsConnected(true);
      
      // Initialize contract with isAddress validation
      const validatedAddress = ethers.getAddress(contractAddress);
      const contract = new ethers.Contract(validatedAddress, contractABI.abi, signer);
      setContract(contract);
      
      setResult({ message: 'Wallet connected on Sepolia! Deposit ETH to play!', isWin: false });
      
      // Update balance and jackpot
      updateBalance();
      updateJackpot();
    } catch (error) {
      console.error("Error connecting wallet:", error);
      setResult({ message: `Connection error: ${error.message}`, isWin: false });
    }
  };

  // Deposit ETH
  const deposit = async (amount) => {
    if (!signer || !contract || isDepositing) return;

    setIsDepositing(true);
    setResult({ message: 'Processing deposit...', isWin: false });

    try {
      const tx = await contract.deposit({ value: ethers.parseEther(amount) });
      await tx.wait();
      await updateBalance();
      setResult({ message: `Successfully deposited ${amount} ETH!`, isWin: true });
      setShowDepositModal(false);
      setDepositInput('0.01');
    } catch (error) {
      console.error("Error depositing:", error);
      setResult({ message: `Deposit failed: ${error.message}`, isWin: false });
    } finally {
      setIsDepositing(false);
    }
  };

  // Withdraw ETH
  const withdraw = async (amount) => {
    if (!signer || !contract || isWithdrawing) return;

    setIsWithdrawing(true);
    setResult({ message: 'Processing withdrawal...', isWin: false });

    try {
      const tx = await contract.withdraw(ethers.parseEther(amount));
      await tx.wait();
      await updateBalance();
      setResult({ message: `Successfully withdrew ${amount} ETH!`, isWin: true });
      setShowWithdrawModal(false);
      setWithdrawInput('0.001');
    } catch (error) {
      console.error("Error withdrawing:", error);
      setResult({ message: `Withdrawal failed: ${error.message}`, isWin: false });
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Spin the slot machine
  const spin = async () => {
    if (!signer || !contract || isSpinning) return;

    const spinCost = '0.001'; // Fixed spin cost

    setIsSpinning(true);
    setResult({ message: 'Processing transaction...', isWin: false });
    setShowConfetti(false);

    try {
      // Call the spin function on the contract
      const tx = await contract.spin(ethers.parseEther(spinCost));
      
      // Start spinning animation only after transaction is sent
      setResult({ message: 'Spinning...', isWin: false });
      const intervalIds = spinReels(); // Start indefinite spinning
      
      const receipt = await tx.wait();
      
      // Get the Spin event from the receipt
      const spinEvent = receipt.logs.find(log => {
        try {
          const parsedLog = contract.interface.parseLog(log);
          return parsedLog.name === "Spin";
        } catch (e) {
          return false;
        }
      });
      
      if (spinEvent) {
        const payout = ethers.formatEther(spinEvent.args.payout);
        const isWin = spinEvent.args.isWin;
        const symbol1 = Number(spinEvent.args.symbol1);
        const symbol2 = Number(spinEvent.args.symbol2);
        const symbol3 = Number(spinEvent.args.symbol3);
        
        // Display actual symbols from blockchain
        const actualSymbols = [symbols[symbol1], symbols[symbol2], symbols[symbol3]];
        stopReels(actualSymbols, intervalIds);
        
        if (isWin) {
          setResult({ 
            message: `🎉 You won ${payout} ETH!`, 
            isWin: true 
          });
          setShowConfetti(true);
          // Hide confetti after 3 seconds
          setTimeout(() => setShowConfetti(false), 3000);
        } else {
          setResult({ 
            message: `😞 You lost this round. Lost 0.001 ETH.`, 
            isWin: false 
          });
        }
      } else {
        setResult({ 
          message: 'Spin completed. Check your balance!', 
          isWin: true 
        });
      }
      
      // Update balance and jackpot
      await updateBalance();
      await updateJackpot();
      
      setIsSpinning(false);
    } catch (error) {
      console.error("Error spinning:", error);
      setResult({ message: `Spin failed: ${error.message}`, isWin: false });
      
      // Stop the reels with random symbols on error
      const finalSymbols = [
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)]
      ];
      // We don't have intervalIds in error case, but we still need to stop the visual spinning
      setSpinningReels([false, false, false]);
      setReels(finalSymbols);
      
      setIsSpinning(false);
    }
  };

  // Format ETH amount
  const formatEth = (amount) => {
    return parseFloat(amount).toFixed(4);
  };

  return (
    <>
      <Head>
        <title>FHE Slot Machine - Privacy-Preserving P2E Game</title>
        <meta name="description" content="Play-to-Earn blockchain slot machine with Fully Homomorphic Encryption on Ethereum Sepolia" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-indigo-900 text-white">
      {/* Confetti effect for wins */}
      {showConfetti && (
        <div className="fixed inset-0 z-10 pointer-events-none">
          {[...Array(150)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                backgroundColor: `hsl(${Math.random() * 360}, 100%, 50%)`,
                animationDelay: `${Math.random() * 2}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
        </div>
      )}

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-10 animate-fade-in">
          <h1 className="text-5xl md:text-7xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-500 animate-pulse">
            FHE SLOT MACHINE
          </h1>
          <p className="text-xl md:text-3xl opacity-90 font-light mt-2">Play-to-Earn with Privacy-Preserving Technology</p>
        </header>

        <main>
          {/* Stats Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-gradient-to-r from-blue-900/80 to-blue-700/80 backdrop-blur-lg rounded-2xl p-6 shadow-2xl transform transition-all duration-300 hover:scale-105 border border-blue-500/30">
              <h3 className="text-lg font-semibold mb-2 text-blue-200">Your Balance</h3>
              <p className="text-3xl font-bold">{formatEth(balance)} <span className="text-xl">ETH</span></p>
            </div>
            
            <div className="bg-gradient-to-r from-purple-900/80 to-purple-700/80 backdrop-blur-lg rounded-2xl p-6 shadow-2xl transform transition-all duration-300 hover:scale-105 border border-purple-500/30">
              <h3 className="text-lg font-semibold mb-2 text-purple-200">Jackpot Pool</h3>
              <p className="text-3xl font-bold">{formatEth(jackpot)} <span className="text-xl">ETH</span></p>
            </div>
            
            <div className="bg-gradient-to-r from-green-900/80 to-green-700/80 backdrop-blur-lg rounded-2xl p-6 shadow-2xl transform transition-all duration-300 hover:scale-105 border border-green-500/30">
              <h3 className="text-lg font-semibold mb-2 text-green-200">Network</h3>
              <p className="text-2xl font-bold">Sepolia</p>
              <p className="text-sm opacity-80">Testnet</p>
            </div>
          </div>

          {/* Wallet Connection */}
          {!isConnected && (
            <div className="text-center mb-12 animate-fade-in">
              <button
                onClick={connectWallet}
                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-700 rounded-full text-xl font-bold shadow-2xl transform transition-all hover:scale-110 hover:from-purple-500 hover:to-indigo-600 animate-bounce flex items-center gap-3 mx-auto"
              >
                <FaWallet className="text-2xl" /> Connect Wallet
              </button>
              <p className="mt-4 text-gray-300 text-lg">Connect your wallet to start playing</p>
            </div>
          )}

          {/* Slot Machine */}
          <div className="slot-machine bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-3xl p-8 mb-10 shadow-2xl border-3 border-blue-500 relative overflow-hidden">
            {/* Background effect */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
              <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-blue-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-1/4 right-1/4 w-1/3 h-1/3 bg-purple-500/10 rounded-full blur-3xl"></div>
            </div>
            
            {/* Reels */}
            <div className="reels-container flex flex-row justify-center gap-6 md:gap-10 my-12 relative z-10">
              {reels.map((symbol, index) => (
                <div
                  key={index}
                  className={`reel ${spinningReels[index] ? 'spinning' : ''}`}
                  style={{ overflow: 'hidden', position: 'relative', height: '150px', width: '150px' }}
                >
                  {/* Inner shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl"></div>
                  
                  {/* Scrolling symbols for spinning effect */}
                  {spinningReels[index] ? (
                    <div 
                      className="absolute inset-0 flex flex-col items-center"
                      style={{ 
                        transform: `translateY(-${reelPositions[index] % (reelSymbols[index].length * 150)}px)`,
                        transition: 'none'
                      }}
                    >
                      {[...Array(reelSymbols[index].length * 2)].map((_, i) => {
                        const symbolIndex = i % reelSymbols[index].length;
                        const displaySymbol = reelSymbols[index][symbolIndex];
                        return (
                          <div 
                            key={i} 
                            className={`icon ${displaySymbol.color}`}
                            style={{ height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '70px' }}
                          >
                            {displaySymbol.emoji}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Static symbol when not spinning
                    <div className="icon-container flex items-center justify-center" style={{ height: '100%' }}>
                      <div className={`icon ${symbol.color}`} style={{ fontSize: '70px' }}>
                        {symbol.emoji}
                      </div>
                    </div>
                  )}
                  
                  {/* 3D border effect */}
                  <div className="absolute inset-0 rounded-3xl border-4 border-white/10 pointer-events-none"></div>
                  
                  {/* Reel mask to show only the center symbol when spinning */}
                  {spinningReels[index] && (
                    <div className="absolute inset-0 pointer-events-none" style={{ 
                      background: 'linear-gradient(to bottom, rgba(26, 26, 46, 1) 0%, transparent 30%, transparent 70%, rgba(26, 26, 46, 1) 100%)' 
                    }}></div>
                  )}
                </div>
              ))}
            </div>

            {/* Bet Controls */}
            <div className="flex flex-col md:flex-row justify-center items-center gap-8 mb-8">
              <div className="flex flex-wrap justify-center gap-4">
                <button
                  onClick={() => setShowDepositModal(true)}
                  disabled={!isConnected || isSpinning || isDepositing || isWithdrawing}
                  className={`px-8 py-4 rounded-2xl font-bold transition-all flex items-center gap-3 text-xl shadow-2xl relative overflow-hidden ${
                    !isConnected
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 hover:scale-105'
                  }`}
                >
                  {/* Button shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative z-10 flex items-center gap-3">
                    <IoMdCash className="text-2xl" /> Deposit
                  </div>
                </button>
                
                <button
                  onClick={spin}
                  disabled={!isConnected || isSpinning || isDepositing || isWithdrawing}
                  className={`px-10 py-5 rounded-2xl text-2xl font-bold transition-all flex items-center gap-3 shadow-2xl relative overflow-hidden ${
                    isSpinning
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 hover:scale-105'
                  }`}
                >
                  {/* Button shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative z-10 flex items-center gap-3">
                    {isSpinning ? (
                      <>
                        <span className="animate-spin text-2xl"><IoMdRefresh /></span> Spinning...
                      </>
                    ) : (
                      <>
                        <FaGamepad className="text-2xl" /> SPIN
                      </>
                    )}
                  </div>
                </button>
                
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={!isConnected || isSpinning || isDepositing || isWithdrawing}
                  className={`px-8 py-4 rounded-2xl font-bold transition-all flex items-center gap-3 text-xl shadow-2xl relative overflow-hidden ${
                    isWithdrawing
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 hover:scale-105'
                  }`}
                >
                  {/* Button shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative z-10 flex items-center gap-3">
                    {isWithdrawing ? (
                      <>
                        <span className="animate-spin text-2xl"><IoMdRefresh /></span> Withdrawing...
                      </>
                    ) : (
                      <>
                        <FaEthereum className="text-2xl" /> Withdraw
                      </>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Result Display */}
            <div className="text-center min-h-24 mb-8">
              <p
                className={`text-3xl font-bold transition-all duration-500 ${
                  result.isWin 
                    ? 'text-green-400 animate-bounce' 
                    : result.message.includes('failed') 
                      ? 'text-red-400' 
                      : 'text-yellow-300'
                }`}
              >
                {result.message}
              </p>
            </div>

            {/* Contract Info */}
            <div className="mt-8 text-center text-sm text-gray-400">
              <p>
                Contract: <span className="font-mono text-gray-300">{contractAddress.substring(0, 6)}...{contractAddress.substring(contractAddress.length - 4)}</span>
              </p>
              <p className="mt-1">
                Network: <span className="font-bold text-purple-400">Sepolia Testnet</span>
              </p>
            </div>
          </div>

          {/* Game Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-gray-700/50 hover:transform hover:scale-105 transition-all duration-300">
              <h2 className="text-2xl font-bold mb-4 text-orange-400 border-b-2 border-orange-400/30 pb-2">How It Works</h2>
              <ul className="space-y-4">
                <li className="flex items-start group">
                  <span className="text-green-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">✓</span>
                  <span className="text-lg">Connect your Ethereum wallet</span>
                </li>
                <li className="flex items-start group">
                  <span className="text-green-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">✓</span>
                  <span className="text-lg">Deposit ETH to play (minimum 0.001 ETH)</span>
                </li>
                <li className="flex items-start group">
                  <span className="text-green-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">✓</span>
                  <span className="text-lg">Each spin costs 0.001 ETH</span>
                </li>
                <li className="flex items-start group">
                  <span className="text-green-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">✓</span>
                  <span className="text-lg">Click SPIN to play</span>
                </li>
                <li className="flex items-start group">
                  <span className="text-green-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">✓</span>
                  <span className="text-lg">Win ETH with provable fairness using FHE</span>
                </li>
              </ul>
            </div>
            
            <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-gray-700/50 hover:transform hover:scale-105 transition-all duration-300">
              <h2 className="text-2xl font-bold mb-6 text-green-400 border-b-2 border-green-400/30 pb-2">Winning Rules</h2>
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-emerald-900/30 to-transparent p-4 rounded-lg border-l-2 border-emerald-400">
                  <h3 className="text-lg font-bold text-green-300 mb-2">🎰 3-of-a-Kind (Biggest Wins)</h3>
                  <div className="space-y-2 text-gray-300">
                    <div className="flex justify-between"><span>🍒 3 Cherries:</span><span className="text-green-400 font-semibold">2.0x</span></div>
                    <div className="flex justify-between"><span>🍇 3 Grapes:</span><span className="text-green-400 font-semibold">2.0x</span></div>
                    <div className="flex justify-between"><span>🍉 3 Watermelons:</span><span className="text-green-400 font-semibold">3.0x</span></div>
                    <div className="flex justify-between"><span>⭐ 3 Stars:</span><span className="text-green-400 font-semibold">3.0x</span></div>
                    <div className="flex justify-between"><span>🔔 3 Bells:</span><span className="text-green-400 font-semibold">6.0x - 15.0x</span></div>
                    <div className="flex justify-between"><span>💎 3 Gems:</span><span className="text-green-400 font-semibold">6.0x - 15.0x</span></div>
                    <div className="flex justify-between"><span>7️⃣ 3 Sevens:</span><span className="text-green-400 font-semibold">50.0x</span></div>
                    <div className="flex justify-between"><span>8️⃣ 3 Eights:</span><span className="text-green-400 font-semibold">75.0x</span></div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-blue-900/30 to-transparent p-4 rounded-lg border-l-2 border-blue-400">
                  <h3 className="text-lg font-bold text-blue-300 mb-2">💰 2-of-a-Kind (Small Wins)</h3>
                  <div className="space-y-2 text-gray-300">
                    <div className="flex justify-between"><span>Low Value (🍒 🍇 🍉 ⭐):</span><span className="text-blue-400 font-semibold">1.5x</span></div>
                    <div className="flex justify-between"><span>Medium Value (🔔 💎):</span><span className="text-blue-400 font-semibold">1.75x</span></div>
                    <div className="flex justify-between"><span>High Value (7️⃣ 8️⃣):</span><span className="text-blue-400 font-semibold">2.0x</span></div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-red-900/30 to-transparent p-4 rounded-lg border-l-2 border-red-400">
                  <h3 className="text-lg font-bold text-red-300 mb-2">❌ No Match</h3>
                  <div className="text-gray-300">Lose your 0.001 ETH bet</div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-lg rounded-2xl p-6 shadow-2xl border border-gray-700/50 hover:transform hover:scale-105 transition-all duration-300">
              <h2 className="text-2xl font-bold mb-4 text-purple-400 border-b-2 border-purple-400/30 pb-2">Privacy Features</h2>
              <div className="space-y-4">
                <div className="flex items-start group">
                  <span className="text-yellow-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">🔒</span>
                  <span className="text-lg">All game logic is computed using Fully Homomorphic Encryption (FHE)</span>
                </div>
                <div className="flex items-start group">
                  <span className="text-yellow-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">🛡️</span>
                  <span className="text-lg">Your bets and results remain private while maintaining provable fairness</span>
                </div>
                <div className="flex items-start group">
                  <span className="text-yellow-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">⚖️</span>
                  <span className="text-lg">Only you can see your actual balance and results</span>
                </div>
                <div className="flex items-start group">
                  <span className="text-yellow-400 mr-3 text-xl mt-1 group-hover:scale-110 transition-transform duration-200">🎲</span>
                  <span className="text-lg">The house cannot manipulate individual games</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Deposit Modal */}
        {showDepositModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4 border border-blue-500/30">
              <h2 className="text-3xl font-bold mb-6 text-white">Deposit ETH</h2>
              
              <div className="mb-6">
                <label className="block text-gray-300 font-semibold mb-3">Amount (ETH)</label>
                <input
                  type="number"
                  value={depositInput}
                  onChange={(e) => setDepositInput(e.target.value)}
                  placeholder="0.01"
                  className="w-full px-4 py-3 rounded-xl bg-gray-700/80 text-white text-center focus:ring-4 focus:ring-blue-500 focus:outline-none border border-gray-600"
                  disabled={isDepositing}
                />
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={() => setShowDepositModal(false)}
                  disabled={isDepositing}
                  className="flex-1 px-6 py-3 rounded-xl bg-gray-700 text-white font-semibold hover:bg-gray-600 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deposit(depositInput)}
                  disabled={isDepositing || !depositInput}
                  className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    isDepositing
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700'
                  }`}
                >
                  {isDepositing ? (
                    <>
                      <span className="animate-spin"><IoMdRefresh /></span> Processing...
                    </>
                  ) : (
                    <>Deposit</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Withdraw Modal */}
        {showWithdrawModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4 border border-purple-500/30">
              <h2 className="text-3xl font-bold mb-6 text-white">Withdraw ETH</h2>
              
              <div className="mb-6">
                <label className="block text-gray-300 font-semibold mb-3">Amount (ETH)</label>
                <input
                  type="number"
                  value={withdrawInput}
                  onChange={(e) => setWithdrawInput(e.target.value)}
                  placeholder="0.001"
                  step="0.001"
                  className="w-full px-4 py-3 rounded-xl bg-gray-700/80 text-white text-center focus:ring-4 focus:ring-purple-500 focus:outline-none border border-gray-600"
                  disabled={isWithdrawing}
                />
              </div>
              
              <div className="flex gap-4">
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  disabled={isWithdrawing}
                  className="flex-1 px-6 py-3 rounded-xl bg-gray-700 text-white font-semibold hover:bg-gray-600 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => withdraw(withdrawInput)}
                  disabled={isWithdrawing || !withdrawInput}
                  className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    isWithdrawing
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700'
                  }`}
                >
                  {isWithdrawing ? (
                    <>
                      <span className="animate-spin"><IoMdRefresh /></span> Processing...
                    </>
                  ) : (
                    <>Withdraw</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="text-center py-8 text-gray-500 border-t border-gray-800/50">
          <p className="mb-2 text-lg">Powered by FHEVM • Blockchain Gaming with Privacy</p>
          <p className="text-sm">This is a testnet application. Use at your own risk.</p>
        </footer>
      </div>

    </div>
    </>
  );
}
