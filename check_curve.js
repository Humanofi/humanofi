// Script to read bonding curve state on-chain
const { Connection, PublicKey } = require("@solana/web3.js");
const { AnchorProvider, Program } = require("@coral-xyz/anchor");
const fs = require("fs");

const PROGRAM_ID = new PublicKey("4u14FtDEdr1UqSXbwhDXDLi552Skm1TPodrtjKje2pmQ");
const MINT = new PublicKey("5XD9QBiY14sHkpNxTSnBUZcR5neQZFwdR2J3csDMdi8u");

// Derive bonding curve PDA
const [bondingCurve] = PublicKey.findProgramAddressSync(
  [Buffer.from("curve"), MINT.toBuffer()],
  PROGRAM_ID
);

console.log("Bonding Curve PDA:", bondingCurve.toBase58());

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./apps/web/src/idl/humanofi.json", "utf8"));
  
  // Create a read-only provider (no wallet needed for reading)
  const provider = new AnchorProvider(connection, {
    publicKey: MINT, // dummy
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  }, { commitment: "confirmed" });
  
  const program = new Program(idl, provider);
  
  // Fetch bonding curve account
  const curve = await program.account.bondingCurve.fetch(bondingCurve);
  
  console.log("\n═══ Bonding Curve State ═══");
  console.log("mint:", curve.mint.toBase58());
  console.log("creator:", curve.creator.toBase58());
  console.log("x (u128):", curve.x.toString());
  console.log("y (u128):", curve.y.toString());
  console.log("k (u128):", curve.k.toString());
  console.log("supply_public:", curve.supplyPublic.toString());
  console.log("supply_creator:", curve.supplyCreator.toString());
  console.log("sol_reserve (lamports):", curve.solReserve.toString());
  console.log("sol_reserve (SOL):", (Number(curve.solReserve) / 1e9).toFixed(9));
  console.log("depth_parameter:", curve.depthParameter.toString());
  console.log("trade_count:", curve.tradeCount.toString());
  console.log("is_active:", curve.isActive);
  
  // Calculate spot price
  const x = BigInt(curve.x.toString());
  const y = BigInt(curve.y.toString());
  const depth = BigInt(curve.depthParameter.toString());
  const solReserve = BigInt(curve.solReserve.toString());
  
  const spotPrice_lamports = Number(x) / Number(y); // lamports per base token
  const spotPrice_sol_per_token = spotPrice_lamports / 1e6; // SOL per token (6 decimals)
  
  console.log("\n═══ Pricing ═══");
  console.log("spot price (lamports/base):", spotPrice_lamports.toFixed(6));
  console.log("spot price (SOL/token):", spotPrice_sol_per_token.toFixed(12));
  
  // Calculate what happens on a sell (5% fee)
  // If buyer has supplyPublic tokens, they'd get sol_reserve back minus fees
  const supplyPublic = Number(curve.supplyPublic.toString());
  if (supplyPublic > 0) {
    // Sell all public tokens: dy = supplyPublic
    // new_y = y + dy
    // new_x = k / new_y
    // dx = x - new_x (SOL returned before fees)
    const dy = BigInt(curve.supplyPublic.toString());
    const k = BigInt(curve.k.toString());
    const new_y = y + dy;
    const new_x = k / new_y;
    const dx = x - new_x; // gross SOL before fees
    
    const fee_total = (dx * 600n) / 10000n; // 6% total sell fee
    const sol_net = dx - fee_total;
    
    console.log("\n═══ Sell Sim (all public tokens) ═══");
    console.log("tokens:", supplyPublic / 1e6, "tokens");
    console.log("gross SOL out:", Number(dx) / 1e9, "SOL");
    console.log("fee (6%):", Number(fee_total) / 1e9, "SOL");
    console.log("net SOL after sell:", Number(sol_net) / 1e9, "SOL");
  }
  
  // Check PDA balance
  const balance = await connection.getBalance(bondingCurve);
  console.log("\n═══ PDA Balance ═══");
  console.log("actual lamports:", balance);
  console.log("actual SOL:", (balance / 1e9).toFixed(9));
  console.log("sol_reserve (from state):", curve.solReserve.toString());
  
  // Get recent transactions for this mint
  const sigs = await connection.getSignaturesForAddress(bondingCurve, { limit: 5 });
  console.log("\n═══ Recent Transactions ═══");
  for (const sig of sigs) {
    console.log(`${sig.signature.slice(0,20)}... | ${sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'N/A'} | ${sig.err ? 'FAILED' : 'OK'}`);
  }
}

main().catch(console.error);
