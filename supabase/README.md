# Humanofi — Supabase

Configuration et migrations pour la base de données Supabase.

## Structure

```
supabase/
├── migrations/
│   └── 00001_initial_schema.sql    # Tables, RLS, fonctions, cron jobs
└── seed/
    └── dev_seed.sql                # Données de test pour le développement
```

## Tables principales

| Table | Description |
|-------|-------------|
| `verified_identities` | HIUIDs vérifiés et wallets associés |
| `creator_tokens` | Tokens créés, profils, activity scores |
| `token_holders` | Balances des holders (sync Helius) |
| `inner_circle_posts` | Posts privés des créateurs |
| `inner_circle_reactions` | Réactions des holders sur les posts |
| `creator_activity` | Log d'activité pour le score |

## Row Level Security (RLS)

Toutes les tables ont RLS activé. Points clés :

- **Inner circle** : accès uniquement si le wallet détient > 0 tokens du créateur
- **Posts** : seul le créateur peut insérer dans son inner circle
- **Holdings** : lecture publique (données on-chain)
- **Identities** : lecture interdite pour tout le monde sauf le service role

## Activity Score Cron

Un cron job `pg_cron` tourne toutes les 24h pour recalculer les scores :

```sql
SELECT cron.schedule('update_activity_scores', '0 3 * * *', $$
  SELECT update_all_activity_scores();
$$);
```

## Setup

```bash
# Lier au projet Supabase
npx supabase link --project-ref YOUR_REF

# Appliquer les migrations
npx supabase db push

# Reset et seed (dev uniquement)
npx supabase db reset
```
