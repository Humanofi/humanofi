# Humanofi — Tests

Tests d'intégration et end-to-end pour le protocole Humanofi.

## Structure

```
tests/
├── anchor/             # Tests du programme Anchor (à venir)
│   └── humanofi.ts     # Tests d'intégration on-chain
├── hiuid/              # Tests du générateur HIUID (à venir)
│   └── hiuid.test.ts   # Tests unitaires
└── api/                # Tests des API routes (à venir)
    └── webhooks.test.ts
```

## Lancer les tests

```bash
# Tous les tests
npm run test

# Tests Anchor uniquement
npm run program:test

# Tests unitaires HIUID
cd packages/hiuid && npm test
```
