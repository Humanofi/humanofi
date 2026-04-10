# Security Policy — Humanofi

## ⚠️ Beta Devnet — Not Audited

This project is currently in **Beta on Solana Devnet**. The smart contracts have **not yet been audited**. Do not deploy these contracts to mainnet with real funds.

## Reporting a Vulnerability

If you discover a security vulnerability in Humanofi, please report it responsibly.

**DO NOT** open a public GitHub issue for security vulnerabilities.

### How to report

Email: **security@humanofi.xyz**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within **48 hours** and provide a detailed response within **7 days**.

## Security Measures

### Smart Contract (Anchor / Solana)

- [ ] **Audit** — Professional audit by a Solana-specialized firm required before mainnet
- All PDAs use deterministic seeds with proper bump validation
- No `unchecked` account deserialization
- Signer verification on all state-mutating instructions
- Arithmetic overflow protection via checked math
- Token-2022 freeze authority prevents unauthorized transfers

### Backend (Next.js API Routes)

- Rate limiting on all endpoints
- HMAC signature verification on Helius webhooks
- Didit webhook signature verification for KYC events
- No PII stored in Supabase — only HIUID hashes
- All secrets read from environment variables, never hardcoded

### Database (Supabase)

- Row Level Security (RLS) enabled on ALL tables
- Service role key never exposed to client
- Inner circle access verified per-query via RLS policies
- No direct database access from frontend

### Identity (HIUID)

- SECRET_PEPPER stored only in environment variables
- Never stored in database or logs
- SHA-256 one-way hashing — non-reversible
- Didit Protocol handles biometric verification and PII

## Audit Status

| Component | Status | Auditor | Date |
|-----------|--------|---------|------|
| Anchor Program | ⏳ Pending | TBD | — |
| Web Application | ⏳ Pending | TBD | — |

## Scope

The following are in scope for security reports:

- Anchor program vulnerabilities
- Authentication / authorization bypass
- Data exposure or leakage
- Cross-site scripting (XSS)
- Injection attacks
- HIUID collision or reversal attacks
- Fee distribution manipulation
- Bonding curve exploitation

## Thank You

We appreciate the security research community's efforts in helping keep Humanofi safe for everyone.
