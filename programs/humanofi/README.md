# Humanofi — Programme Anchor (Solana)

Programme custom construit directement sur **Token-2022** et **Anchor 0.31.1**.

> 1 humain vérifié = 1 token personnel = 1 marché on-chain

## Program ID

```
C88xL1xsuSi4g8yXDY3MtZUKiAcH1RTs9eQSLVpm4YiR
```

## Architecture

```
programs/humanofi/
├── src/
│   ├── lib.rs                 # Entry point — declare_id!, toutes les instructions
│   ├── constants.rs           # Constantes du protocole (fees, vesting, limits)
│   ├── errors.rs              # Codes d'erreur custom par domaine
│   │
│   ├── state/                 # PDAs (Program Derived Accounts)
│   │   ├── mod.rs
│   │   ├── bonding_curve.rs   # État de la courbe : reserve SOL, supply, prix
│   │   ├── creator_vault.rs   # Vesting progressif (0%→10%→20%/an)
│   │   ├── reward_pool.rs     # Accumulateur reward-per-token (claim model)
│   │   └── purchase_limiter.rs # Limites d'achat progressives + exit tax eligibility
│   │
│   └── instructions/          # Logique métier
│       ├── mod.rs
│       ├── create_token.rs    # Mint Token-2022 + freeze authority + init PDAs
│       ├── buy.rs             # Achat via bonding curve + fee split + freeze
│       ├── sell.rs            # Vente : thaw + burn + exit tax + refreeze
│       ├── claim_rewards.rs   # Claim rewards accumulés (reward-per-token)
│       └── unlock_tokens.rs   # Unlock progressif des tokens créateur
│
├── Cargo.toml
└── Xargo.toml
```

## Mécanisme Anti-Manipulation : Freeze Authority

Les tokens sont **confinés** dans le programme via le mécanisme **freeze authority** de Token-2022 :

```
Le bonding_curve PDA est à la fois :
  → mint_authority   (seul le programme peut créer des tokens)
  → freeze_authority (seul le programme peut geler/dégeler des comptes)

Flux Buy :  SOL → mint tokens → FREEZE le compte acheteur
Flux Sell : THAW le compte → burn tokens → REFREEZE si balance > 0

Résultat :
  Transaction via programme Humanofi    →  ✅ Autorisée
  Transaction via Jupiter / Raydium     →  ❌ Bloquée (compte gelé)
  Transfert direct entre wallets        →  ❌ Bloqué (compte gelé)
```

**Pourquoi freeze authority plutôt que Transfer Hook ?**
- Le Transfer Hook nécessite un programme séparé + CPI additionnel à chaque transfert
- Le freeze authority est natif Token-2022, zéro overhead, zéro contournement
- Un compte gelé ne peut littéralement RIEN faire — c'est le contrôle le plus strict possible
- Code plus simple = moins de surface d'attaque = meilleure auditabilité

Conséquences :
- Sandwich attacks → physiquement impossibles
- Front-running → impossible (un seul point d'entrée)
- Contournement des limites → impossible
- Exit tax → garantie à 100%

## Instructions

### 1. `create_token`
Crée un token personnel avec tous les PDAs :
- Mint Token-2022 (freeze_authority = bonding_curve PDA)
- BondingCurve PDA initialisée (base_price, slope)
- CreatorVault PDA avec vesting progressif
- RewardPool PDA initialisé
- 100M tokens (10% supply) → ATA créateur → gelé

### 2. `buy`
Achat de tokens via la bonding curve :
- SOL → calcul prix via bonding curve linéaire (intégrale exacte)
- 2% de frais split :
  - 50% → wallet créateur (direct)
  - 30% → RewardPool PDA (claim model)
  - 20% → treasury Humanofi
- Vérification des limites d'achat (PurchaseLimiter)
- Mint tokens → freeze le compte acheteur
- Si acheteur existant : thaw → mint → refreeze

### 3. `sell`
Vente de tokens contre SOL :
- Thaw le compte vendeur → burn tokens → refreeze si balance restante
- Retour SOL calculé via bonding curve intégrale (anti-arbitrage)
- Exit tax 10% si vente < 90 jours → redistribué aux holders
- 2% de frais standard (même split que buy)
- SOL transféré du PDA bonding_curve vers le vendeur

### 4. `claim_rewards`
Claim des rewards accumulés :
- Pattern reward-per-token O(1) (identique Synthetix/Compound)
- `pending = balance × (global_rpt - personal_rpt) / 10^18`
- SOL transféré du RewardPool PDA vers le holder
- HolderRewardState PDA pour tracker le dernier claim

### 5. `unlock_tokens`
Unlock progressif des tokens créateur :
- **Année 1 : 0%** — lock total, zéro liquidité
- **Année 2-3 : 10%/an** de l'allocation originale
- **Année 4+ : 20%/an** de l'allocation originale
- **Année 7+ : 100% cumulatif max**
- Le créateur spécifie le `amount_to_unlock`
- Thaw le compte créateur (permet la vente via bonding curve)
- Impossible de dump sa position — skin in the game structurel

## PDAs (Program Derived Accounts)

| PDA | Seeds | Rôle |
|-----|-------|------|
| BondingCurve | `["curve", mint]` | État du marché (reserve SOL, supply, prix), mint_authority + freeze_authority |
| CreatorVault | `["vault", mint]` | Vesting progressif (0%→10%→20%/an), tracking des unlocks cumulés |
| RewardPool | `["rewards", mint]` | Accumulateur fees pour holders (reward-per-token pattern) |
| PurchaseLimiter | `["limiter", wallet, mint]` | Limites d'achat progressives + timestamp premier achat |
| HolderRewardState | `["reward_state", mint, holder]` | Dernier reward_per_token claimé par holder |

## Bonding Curve — Mathématique

Courbe **linéaire** avec calcul par intégrale (anti-arbitrage) :

```
price(s) = base_price + slope × s / PRECISION

cost_buy(amount, current_supply) = base_price × amount 
    + slope × (2 × supply × amount + amount²) / (2 × PRECISION)

return_sell(amount, current_supply) = base_price × amount
    + slope × (2 × supply × amount - amount²) / (2 × PRECISION)

PRECISION = 10^12
```

## Sécurité

- **Freeze Authority** : confine les tokens au programme (Token-2022)
- **Box<>** sur les comptes larges : évite le stack overflow SBF
- **Init-if-needed** uniquement avec payer = user
- **Seeds déterministes** avec bump validation
- **`checked_*` operations** partout — overflow impossible
- **Reentrancy** safe par design (Anchor CPI)
- **Signer verification** sur toutes les instructions sensibles

## Dépendances

```toml
[dependencies]
anchor-lang = { version = "0.31.1", features = ["init-if-needed"] }
anchor-spl = { version = "0.31.1", features = ["token_2022"] }
```

## Commands

```bash
# Build
anchor build

# Test sur localnet
anchor test

# Déployer sur devnet
anchor deploy --provider.cluster devnet
```
