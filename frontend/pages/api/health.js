export default function handler(req, res) {
  res.status(200).json({ status: 'ok', message: 'FHE Slot Machine API is running' });
}