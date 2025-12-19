import { ethers } from 'ethers';
import contractABI from '../../public/FHESlotMachine.json';

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    const contractAddress = process.env.CONTRACT_ADDRESS || '0xB04F7EC617d7A5272a1c170C478902772eD5EF84';
    
    res.status(200).json({
      contractAddress,
      abi: contractABI.abi,
      network: 'sepolia'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load contract data' });
  }
}