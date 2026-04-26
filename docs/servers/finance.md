---
title: Finance & Accounting
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Finance & Accounting

Self-hosted personal finance, double-entry bookkeeping, invoicing, budgeting, stock portfolio tracking, and cryptocurrency nodes. Keep your financial data on hardware you own.

> **Why self-host finance tools?** Financial data is among the most sensitive data you produce. Cloud tools like Mint, YNAB, and QuickBooks Online have been acquired, shut down, or had data breaches. Running these tools locally means your transaction history, budget, and account balances are never transmitted to a third party.

---

---

## Job-Ready Concepts

#### Double-entry bookkeeping — the foundation
Every financial transaction involves at least two entries: a debit to one account and a credit to another of equal value. The books always balance: Assets = Liabilities + Equity. In Firefly III and hledger, every transaction explicitly moves money between accounts. This model makes inconsistency impossible — you cannot spend money without a source account, and income must credit somewhere. Contrast with single-entry systems (a simple spreadsheet of income and expenses) which can't catch errors or produce a balance sheet. Any role in fintech, accounting software, or financial data engineering requires understanding this model.

#### Chart of accounts and financial reporting
A chart of accounts (COA) is the complete list of an entity's financial accounts, organised by type: Assets (cash, accounts receivable, inventory), Liabilities (accounts payable, loans), Equity (owner's equity, retained earnings), Income (sales, service revenue), and Expenses (rent, payroll, COGS). A balance sheet shows Assets vs Liabilities + Equity at a point in time. A profit and loss (P&L) statement shows Income vs Expenses over a period. A cash flow statement shows actual cash movements. These three statements are the output of any accounting system — knowing what they contain and how they relate is baseline financial literacy for any engineer working in fintech.

#### Open banking and bank data APIs
PSD2 (EU) and equivalent regulations require banks to expose customer data via APIs to authorised third parties. The standard is OpenBanking UK (for UK banks) or Berlin Group NextGenPSD2 (for EU banks). Kresus uses Woob (previously weboob) to scrape bank data where APIs aren't available — a fragile but practical approach. Production open banking integrations use providers like TrueLayer, Plaid (US), or Salt Edge to normalise the bank API surface. Understanding that Plaid is a data aggregator (not a bank) and that its underlying data comes from screen-scraping or direct API connections depending on the institution is relevant for any fintech infrastructure role.

#### Cryptocurrency node operation — UTXO vs account model
Bitcoin uses a UTXO (Unspent Transaction Output) model: your "balance" is the sum of discrete outputs from previous transactions that haven't been spent. A transaction consumes UTXOs as inputs and creates new UTXOs as outputs. Ethereum uses an account model: each address has a balance that's updated atomically. The operational difference: a Bitcoin full node validates by tracking all UTXOs (the UTXO set, ~6 GB); an Ethereum node tracks account state. Running a full node verifies your own transactions without trusting a third party — relevant for financial sovereignty and as a building block for Lightning Network routing nodes, which require a synced Bitcoin full node.

#### Tax reporting and capital gains calculation
Most jurisdictions tax cryptocurrency as a capital asset — each disposal (sale, exchange, spend) triggers a taxable event calculated as proceeds minus cost basis. Cost basis methods: FIFO (first in, first out), LIFO (last in, first out), and specific identification. A single portfolio can have thousands of taxable events. Tools like Rotki automate this by importing trade history, applying cost basis rules, and generating tax reports. For regulated financial software, the audit trail — a complete, immutable record of every transaction and its tax treatment — is a compliance requirement, not optional.

#### ISO 20022 and financial messaging standards
ISO 20022 is the emerging global standard for financial messaging (replacing SWIFT MT messages). It uses XML or JSON to describe payments, securities, and foreign exchange transactions with rich structured data. This migration (most major payment networks are switching by 2025–2026) affects any fintech system that processes interbank payments. For engineering roles at payment processors, banks, or fintech platforms: understanding that ISO 20022 carries more data per message (purpose of payment, LEI identifiers, structured remittance information) than its predecessors is increasingly expected baseline knowledge.


## Firefly III (Personal Finance Manager)

**Purpose:** The most feature-complete self-hosted personal finance manager. Uses double-entry bookkeeping — every transaction moves money between accounts, which means the books always balance. Supports bank accounts, credit cards, cash wallets, savings accounts, investments, and liabilities. Tracks income, expenses, transfers, budgets, categories, tags, and recurring transactions. Produces detailed reports and charts.

```yaml
# ~/firefly/compose.yml
services:
  firefly:
    image: fireflyiii/core:latest
    ports: ["127.0.0.1:8080:8080"]
    environment:
      APP_KEY: changeme-run-php-artisan-key-generate-or-openssl-rand-base64-32
      APP_URL: https://firefly.home.local
      DB_CONNECTION: pgsql
      DB_HOST: db
      DB_PORT: 5432
      DB_DATABASE: firefly
      DB_USERNAME: firefly
      DB_PASSWORD: changeme
      CACHE_DRIVER: redis
      SESSION_DRIVER: redis
      REDIS_HOST: redis
      TZ: Asia/Kolkata
      TRUSTED_PROXIES: "**"
    volumes:
      - /home/user/firefly/upload:/var/www/html/storage/upload:Z
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: firefly
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: firefly
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  # Firefly III Data Importer — imports from bank CSV and GoCardless/Nordigen
  importer:
    image: fireflyiii/data-importer:latest
    ports: ["127.0.0.1:8081:8080"]
    environment:
      FIREFLY_III_URL: http://firefly:8080
      VANITY_URL: https://firefly.home.local
      FIREFLY_III_ACCESS_TOKEN: your-personal-access-token
      TZ: Asia/Kolkata
    depends_on: [firefly]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/firefly && podman-compose up -d
```

#### Common operations
```bash
# Run Laravel artisan commands
podman exec firefly php artisan firefly-iii:upgrade-database
podman exec firefly php artisan cache:clear
podman exec firefly php artisan view:clear

# Create an initial admin user (if setup isn't complete)
podman exec firefly php artisan firefly-iii:create-first-user

# Run cron job manually (for recurring transactions)
podman exec firefly php artisan firefly-iii:cron

# View logs
podman logs -f firefly

# Backup SQLite database (if using SQLite)
podman exec firefly cp /var/www/html/storage/database/firefly.db /tmp/firefly-backup.db
podman cp firefly:/tmp/firefly-backup.db ./firefly-backup.db
```

#### Key workflows
- Create accounts (assets, liabilities, revenue, expense accounts)
- Import transactions via the Data Importer from your bank's CSV export
- Set up budgets with monthly limits per category
- Configure recurring transactions for rent, subscriptions, salary
- Use the Rules engine to auto-categorise transactions by description pattern

**Caddy:**
```caddyfile
firefly.home.local   { tls internal; reverse_proxy localhost:8080 }
importer.home.local  { tls internal; reverse_proxy localhost:8081 }
```

---

## Actual Budget

**Purpose:** Local-first envelope budgeting app using zero-based budgeting. You assign every pound or rupee a job — the budget is a plan, not just a record. All data is stored in your browser (SQLite in IndexedDB) and synced to a self-hosted server. Extremely fast, works offline, and the data is 100% yours.

```yaml
# ~/actual/compose.yaml
services:
  actual:
    image: actualbudget/actual-server:latest
    ports:
      - 127.0.0.1:5006:5006
    volumes:
      - /home/user/actual/data:/data:Z
    restart: unless-stopped
```

```bash
cd ~/actual && podman-compose up -d
```

Access at `http://localhost:5006`. Create a new budget file, import bank transactions via CSV, and assign income to budget categories each month.

> Actual Budget is the best choice if you want a zero-based budgeting workflow (similar to YNAB) with completely local data and no subscription.

---

## Ghostfolio (Investment Portfolio Tracker)

**Purpose:** Open-source wealth management and portfolio tracking. Tracks stocks, ETFs, cryptocurrencies, and other assets across multiple brokerage accounts. Shows portfolio performance, asset allocation, dividend history, XIRR, and fire number progress. Integrates with Yahoo Finance and CoinGecko for live prices.

```yaml
# ~/ghostfolio/compose.yml
services:
  ghostfolio:
    image: ghostfolio/ghostfolio:latest
    ports: ["127.0.0.1:3333:3333"]
    environment:
      DATABASE_URL: postgresql://ghostfolio:changeme@db:5432/ghostfolio?sslmode=prefer
      REDIS_HOST: redis
      REDIS_PORT: 6379
      JWT_SECRET_KEY: changeme-run-openssl-rand-base64-32
      ACCESS_TOKEN_SALT: changeme-run-openssl-rand-base64-32
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ghostfolio
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: ghostfolio
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/ghostfolio && podman-compose up -d
```

#### Common operations
```bash
# View logs
podman logs -f ghostfolio

# Run database migrations
podman exec ghostfolio npx prisma migrate deploy

# Refresh market data manually
curl -X POST http://localhost:3333/api/v1/admin/gather/max   -H "Authorization: Bearer YOUR_API_KEY"

# Export portfolio data
curl http://localhost:3333/api/v1/export   -H "Authorization: Bearer YOUR_API_KEY" -o portfolio-export.json
```

Access at `http://localhost:3333`. Add activities (buy/sell transactions) and Ghostfolio calculates current value, cost basis, P&L, and charts portfolio performance over time.

---

## Invoice Ninja (Invoicing & Billing)

**Purpose:** Full-featured invoicing, quotes, expenses, time tracking, and client management. Generates professional PDF invoices, accepts online payments (Stripe, PayPal, GoCardless), and handles recurring invoices. Essential for freelancers and small businesses who want to own their billing data.

```yaml
# ~/invoiceninja/compose.yml
services:
  app:
    image: invoiceninja/invoiceninja:5
    ports: ["127.0.0.1:8082:80"]
    environment:
      APP_URL: https://invoices.home.local
      APP_KEY: changeme-base64-32-chars
      DB_HOST: db
      DB_DATABASE: ninja
      DB_USERNAME: ninja
      DB_PASSWORD: changeme
      PHANTOMJS_PDF_GENERATION: "false"
      PDF_GENERATOR: snappdf
      QUEUE_CONNECTION: database
    volumes:
      - /home/user/invoiceninja/public:/var/www/app/public/storage:Z
      - /home/user/invoiceninja/storage:/var/www/app/storage:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: mariadb:10.11
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: ninja
      MYSQL_USER: ninja
      MYSQL_PASSWORD: changeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/invoiceninja && podman-compose up -d
```

**Payment Gateway Setup:**

Invoice Ninja supports Stripe, PayPal, and GoCardless as online payment gateways. Configure them under **Settings → Payment Gateways** in the Invoice Ninja web UI.

*Stripe:*
1. Create a Stripe account at [dashboard.stripe.com](https://dashboard.stripe.com) and retrieve your **Publishable key** and **Secret key** from the Developers → API keys section.
2. In Invoice Ninja → Settings → Payment Gateways → Add Gateway → select **Stripe**.
3. Paste your Publishable key and Secret key. Enable the card types you want to accept (Visa, Mastercard, etc.).
4. Set up a webhook in the Stripe dashboard pointing to `https://invoices.home.local/payment-webhook/stripe` so Invoice Ninja receives real-time payment confirmations.

*PayPal:*
1. Create a PayPal Business account and go to [developer.paypal.com](https://developer.paypal.com). Under **Apps & Credentials** create a new app and copy the **Client ID** and **Client Secret**.
2. In Invoice Ninja → Settings → Payment Gateways → Add Gateway → select **PayPal Express Checkout**.
3. Paste Client ID and Secret. Toggle Live mode (off for sandbox testing, on for production).

*GoCardless (Direct Debit — EUR/GBP):*
1. Sign up at [gocardless.com](https://gocardless.com) and retrieve your **Access Token** from the Developers section.
2. In Invoice Ninja → Settings → Payment Gateways → Add Gateway → select **GoCardless**.
3. Paste the Access Token and select your scheme (BACS for UK, SEPA for EU).
4. GoCardless is a pull-payment method — clients authorise a mandate, and Invoice Ninja charges them automatically for recurring invoices.

> After adding a gateway, assign it to a currency under **Settings → Payment Gateways → (gateway) → Edit → Accepted Currencies** to control which invoices offer that payment option.

---

## Hledger / Beancount (Plain Text Accounting)

**Purpose:** Plain text double-entry accounting — your ledger is a `.journal` or `.beancount` file you edit with any text editor, version-controlled in Git. No database, no web UI required (though both have optional web interfaces). Beloved by programmers who want total control over their financial data.

```yaml
# ~/hledger/compose.yaml
services:
  hledger:
    image: dastapov/hledger
    ports:
      - 127.0.0.1:5000:5000
    volumes:
      - /home/user/finance/ledger.journal:/data/ledger.journal:ro,Z
    command: hledger-web --file /data/ledger.journal --host 0.0.0.0
    restart: unless-stopped
```

```bash
cd ~/hledger && podman-compose up -d
```

---

## Bitcoin / Lightning Node (Umbrel-style)

**Purpose:** Run a full Bitcoin node to validate your own transactions without trusting a third party, and a Lightning Network node for instant low-fee payments. Sovereignty over your Bitcoin — no relying on someone else's node.

```yaml
# ~/bitcoin/compose.yml
services:
  bitcoin:
    image: lncm/bitcoind:latest
    ports:
      - "127.0.0.1:8332:8332"   # RPC
      - "0.0.0.0:8333:8333"     # P2P (needs to be open for the network)
    volumes:
      - /home/user/bitcoin/data:/data/.bitcoin:Z
    environment:
      BITCOIN_DATA: /data/.bitcoin
    command: >
      bitcoind
        -server=1
        -rpcuser=bitcoin
        -rpcpassword=changeme
        -rpcallowip=127.0.0.1
        -txindex=1
        -prune=0
    restart: unless-stopped

  # LND — Lightning Network Daemon
  lnd:
    image: lightninglabs/lnd:latest
    ports:
      - "127.0.0.1:10009:10009"  # gRPC
      - "0.0.0.0:9735:9735"      # P2P
    volumes:
      - /home/user/lnd/data:/root/.lnd:Z
    environment:
      HOME: /root
    command: >
      lnd
        --bitcoin.active
        --bitcoin.mainnet
        --bitcoin.node=bitcoind
        --bitcoind.rpchost=bitcoin
        --bitcoind.rpcuser=bitcoin
        --bitcoind.rpcpass=changeme
        --bitcoind.zmqpubrawblock=tcp://bitcoin:28332
        --bitcoind.zmqpubrawtx=tcp://bitcoin:28333
        --rpclisten=0.0.0.0:10009
        --restlisten=0.0.0.0:8080
    depends_on: [bitcoin]
    restart: unless-stopped

  # ThunderHub — Lightning node management UI
  thunderhub:
    image: apotdevin/thunderhub:latest
    ports: ["127.0.0.1:3000:3000"]
    environment:
      ACCOUNT_CONFIG_PATH: /app/config/thubConfig.yaml
    volumes:
      - /home/user/thunderhub/config:/app/config:Z
      - /home/user/lnd/data:/lnd:ro,Z
    depends_on: [lnd]
    restart: unless-stopped
```

```bash
cd ~/bitcoin && podman-compose up -d
```

> **Storage:** A full Bitcoin node requires ~740 GB of disk space for the full chain (growing ~50–60 GB/year). Use `prune=550` (MB) in bitcoind config for a pruned node that verifies without storing the full history — sufficient for most use cases.

**Firewall:**
```bash
sudo firewall-cmd --add-port=8333/tcp --permanent   # Bitcoin P2P
sudo firewall-cmd --add-port=9735/tcp --permanent   # Lightning P2P
sudo firewall-cmd --reload
```

---

## Monero Node

**Purpose:** Run a full Monero node for private, untraceable transactions. A local node provides full validation and better privacy than connecting through a third-party node.

```yaml
# ~/monero/compose.yaml
services:
  monero:
    image: sethsimmons/simple-monerod:latest
    ports:
      - 127.0.0.1:18081:18081
      - 0.0.0.0:18080:18080
    volumes:
      - /home/user/monero/data:/home/monero/.bitmonero:Z
    command: --rpc-restricted-bind-ip=0.0.0.0 --rpc-restricted-bind-port=18089 --no-igd --prune-blockchain
    restart: unless-stopped
```

```bash
cd ~/monero && podman-compose up -d
```

---

## CryptoFolio / Rotki (Privacy-First Crypto Portfolio)

**Purpose:** Rotki is a privacy-preserving crypto portfolio tracker that runs entirely locally. It connects to exchanges via API (read-only keys), calculates capital gains and losses, and generates tax reports — all on your machine, never uploading your portfolio to any server.

```yaml
# ~/rotki/compose.yaml
services:
  rotki:
    image: rotki/rotki:latest
    ports:
      - 127.0.0.1:4242:80
    volumes:
      - /home/user/rotki/data:/rotki/data:Z
      - /home/user/rotki/logs:/rotki/logs:Z
    restart: unless-stopped
```

```bash
cd ~/rotki && podman-compose up -d
```

Access at `http://localhost:4242`. Connect exchanges (Binance, Coinbase, Kraken) via read-only API keys and import wallets by address.

---

## Paisa (Indian Personal Finance Tracker)

**Purpose:** A personal finance tracker purpose-built for Indian users — imports transactions from Indian bank statement formats (SBI, HDFC, ICICI, Axis, Zerodha, Kuvera), handles INR natively, and supports Indian mutual funds and stock holdings. Built on hledger under the hood with a polished web UI for non-accountants. Ideal if you want double-entry bookkeeping accuracy without writing journal entries by hand.

```yaml
# ~/paisa/compose.yaml
services:
  paisa:
    image: ananthakumaran/paisa:latest
    ports:
      - 127.0.0.1:7500:7500
    volumes:
      - /home/user/paisa:/root/paisa:Z
    environment:
      TZ: Asia/Kolkata
    restart: unless-stopped
```

```bash
cd ~/paisa && podman-compose up -d
```

Access at `http://localhost:7500`. On first run, Paisa creates a `~/.paisa/` directory. Import your ledger file or start fresh by adding accounts and importing bank CSVs via the UI.

**Caddy:**
```caddyfile
paisa.home.local { tls internal; reverse_proxy localhost:7500 }
```

---

## Choosing the Right Tool

| Use Case | Recommended Tool |
|----------|-----------------|
| Personal finance / household budgeting (double-entry) | Firefly III |
| Zero-based envelope budgeting (YNAB-style) | Actual Budget |
| Investment portfolio & wealth tracking | Ghostfolio |
| Freelancer invoicing & billing | Invoice Ninja |
| Full business accounting & ERP | ERPNext |
| Programmer / power-user ledger | hledger / Beancount |
| Indian bank imports & INR-native tracking | Paisa |
| European bank auto-import via open banking | Kresus |
| Bitcoin sovereignty | Bitcoin Core + LND + ThunderHub |
| Crypto portfolio + tax reports | Rotki |

---

## Kresus (Open Banking Personal Finance)

**Purpose:** Self-hosted personal finance manager with automatic bank import via open banking connectors (Woob). Kresus connects directly to hundreds of European banks and financial institutions, imports transactions automatically, and helps you categorise, budget, and analyse spending — no manual CSV exports required. A strong complement to Firefly III for users who want automatic bank synchronisation.

```yaml
# ~/kresus/compose.yml
services:
  kresus:
    image: bnjbvr/kresus:latest
    ports: ["127.0.0.1:9876:9876"]
    environment:
      LOCAL_USER_ID: 1000
      KRESUS_SALT: changeme-run-openssl-rand-hex-32
      KRESUS_SECRET: changeme-run-openssl-rand-hex-32
      KRESUS_DB_TYPE: postgres
      KRESUS_DB_HOST: db
      KRESUS_DB_PORT: 5432
      KRESUS_DB_NAME: kresus
      KRESUS_DB_USERNAME: kresus
      KRESUS_DB_PASSWORD: changeme
      KRESUS_PYTHON_EXEC: python3
    volumes:
      - /home/user/kresus/data:/home/user/data:Z
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: kresus
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: kresus
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/kresus && podman-compose up -d
```

Access at `http://localhost:9876`. Add your bank under Settings → Banks — Kresus uses Woob connectors to fetch transactions. Supported banks include most major European institutions (BNP Paribas, Société Générale, ING, Revolut, N26, and 300+ more).

> Kresus works best for European users with supported banks. For Indian banks, use Paisa. For US/global manual import, use Firefly III with the data importer.

**Caddy:**
```caddyfile
kresus.home.local { tls internal; reverse_proxy localhost:9876 }
```

---

## Caddy Configuration

```caddyfile
firefly.home.local    { tls internal; reverse_proxy localhost:8080 }
importer.home.local   { tls internal; reverse_proxy localhost:8081 }
budget.home.local     { tls internal; reverse_proxy localhost:5006 }
portfolio.home.local  { tls internal; reverse_proxy localhost:3333 }
invoices.home.local   { tls internal; reverse_proxy localhost:8082 }
thunderhub.home.local { tls internal; reverse_proxy localhost:3000 }
rotki.home.local      { tls internal; reverse_proxy localhost:4242 }
paisa.home.local      { tls internal; reverse_proxy localhost:7500 }
kresus.home.local     { tls internal; reverse_proxy localhost:9876 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Firefly III `No application encryption key` | Generate with `openssl rand -base64 32` and set as `APP_KEY`; must be exactly 32 bytes base64-encoded |
| Firefly III importer can't connect | Generate a Personal Access Token in Firefly III (Profile → OAuth → Personal Access Tokens) and paste it into the importer's `FIREFLY_III_ACCESS_TOKEN` |
| Actual Budget sync fails | Ensure the server URL in the app matches exactly — `http://` vs `https://` matters; check that the server container is running |
| Ghostfolio prices not loading | Yahoo Finance rate-limits aggressive polling; wait a few minutes or check `podman logs ghostfolio` for 429 errors |
| Invoice Ninja blank PDF | Ensure `PDF_GENERATOR=snappdf` is set; `snappdf` uses Chromium bundled in the container — check it's installed with `podman exec app snappdf` |
| Bitcoin node stuck syncing | Initial block download takes days to weeks; check `podman logs bitcoin` for progress; ensure fast disk (SSD preferred over HDD) |
| LND `unable to connect to bitcoind` | Verify ZMQ ports `28332`/`28333` are published in the bitcoind container; check the `--bitcoind.zmqpubrawblock` address |
| Rotki exchange API error | Verify the API key has read-only permissions; some exchanges require IP whitelisting — add your server's Tailscale IP |
| hledger web shows wrong data | Ensure the journal file path inside the container matches the volume mount; run `hledger check` to validate journal syntax |
| Kresus bank not found | Check the Woob connector list at `https://weboob.org/modules` — some banks require an active Woob module; update the container for the latest connectors |
| Kresus transactions not importing | Some bank connectors require 2FA — Kresus will prompt for the code during the first sync; check `podman logs kresus` for authentication errors |

> 💡 **Backup tip:** Financial data deserves extra backup care. Run Restic backups of `/home/user/firefly`, `/home/user/actual`, and `/home/user/ghostfolio` daily to an encrypted offsite destination. A lost transaction history is hard to reconstruct.
