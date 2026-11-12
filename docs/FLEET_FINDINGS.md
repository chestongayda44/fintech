# Answer key: planted findings in `services/` (stage 6 sweep)

For the presenter. The fleet is a representative sample built for the demo; these are the flaws
planted in it. Claude may word or rank them differently; check it finds the criticals.

## Critical
| Service | File | Finding | Why it matters |
|---|---|---|---|
| aml-screening (Go) | `main.go` `loadSanctions` | **Silent fallback**: if the sanctions feed is down it screens against the cached list with no alert or age check; if the cache is missing it returns an **empty list**, so everyone passes | Sanctioned parties can be onboarded or paid; regulatory breach |
| loan-origination (Java) | `CreditDecision.java` `creditScore` | **Silent fallback**: any bureau error returns a default score of 680, above the 660 approval threshold | Loans approved without a real credit check |
| payments-gateway (Go) | `main.go` `authorize` | **Card number in logs**: logs the full PAN when the processor call fails | PCI DSS violation; logs become cardholder data |
| kyc-checks (Python) | `kyc.py` `verify_applicant` | **PII in logs**: logs full name, date of birth and SSN at INFO | Identity data exposed to everyone with log access |

## High
| Service | File | Finding |
|---|---|---|
| credit-limits (TypeScript) | `src/limits.ts` | **Silent fallback**: risk engine down → last known limit, or a default $5,000 limit for unknown customers |
| fx-rates (Python) | `fx_rates.py` | **Silent fallback** (the incident's exact pattern): API down → publishes cached rates and exits 0, no age check |
| fraud-scoring (Python) | `scoring.py` | **Silent fallback**: registry unreachable → loads the bundled `fraud_v1` model; also **no timeout** on the registry call |
| reporting-etl (shell) | `run_nightly.sh` | **Silent failure**: `|| true` on extract and upload, then `exit 0`; a failed regulatory report looks successful |
| statements (Python) | `send_statements.py` | **Hard-coded secret**: SMTP password in source |
| notifications (TypeScript) | `src/send.ts` | **Hard-coded secret**: messaging partner token in source |

## Medium
| Service | File | Finding |
|---|---|---|
| payments-gateway (Go) | `main.go` | **No timeout**: `http.Post` uses the default client (waits forever) |
| rewards (TypeScript) | `src/points.ts` | **No timeout** on the partner `fetch` |

## Clean (good examples Claude may call out)
- **card-auth (Go):** masks the card number in logs, 3s client timeout, fails *closed* (declines) when verification is unavailable.
- **ledger-sync (Go):** timeouts, errors returned and exit 1 on failure, token from the environment.
- **disputes (Python):** timeout, error logged and re-raised, only the last 4 digits sent.
- **mobile-bff (TypeScript):** timeouts, errors propagate.
- **account-service (Java):** query timeout, parameterized SQL, not-found is an error.

**Totals:** 16 services, 12 findings in 11 services (4 critical, 6 high, 2 medium), 5 clean.
