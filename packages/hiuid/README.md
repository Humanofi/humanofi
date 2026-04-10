# @humanofi/hiuid — Humanofi Unique Identity

Génère un hash déterministe unique (HIUID) à partir des données d'identité vérifiées d'une personne.

## Principe

```
1 humain = 1 HIUID = 1 token
```

Le HIUID est un hash SHA-256 non-réversible calculé à partir de 5 données d'identité normalisées + un SECRET_PEPPER. La même personne produit toujours le même HIUID, ce qui garantit l'unicité.

## Algorithme

```
Inputs (normalisés) :
  1. Prénom       → lowercase, sans accents, sans espaces
  2. Nom          → lowercase, sans accents, sans espaces
  3. Date naiss.  → YYYY-MM-DD (ISO strict)
  4. Pays naiss.  → code ISO 3166-1 alpha-2
  5. N° document  → SHA-256 intermédiaire

Formule :
  input_string = "prenom|nom|YYYY-MM-DD|XX|doc_hash"
  HIUID = SHA-256(input_string + SECRET_PEPPER)
```

## Usage

```typescript
import { generateHIUID, normalizeInput } from "@humanofi/hiuid";

const hiuid = generateHIUID({
  firstName: "Jean-Baptiste",
  lastName: "Müller",
  dateOfBirth: "1990-03-15",
  countryCode: "FR",
  documentNumber: "AB123456",
});

// → "9e2c4a8f1b..."  (64 hex chars, déterministe)
```

## Sécurité

- Le `SECRET_PEPPER` est **obligatoire** et doit être une chaîne de 64 caractères aléatoires
- Sans le PEPPER, le HIUID est impossible à recalculer → protection dictionnaire
- **Jamais** stocker le PEPPER en base de données — uniquement en variable d'environnement
- Aucune donnée personnelle n'est conservée après le calcul du HIUID
