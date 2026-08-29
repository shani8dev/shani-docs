---
title: Security & Identity — Scanning, SBOM & Policy Enforcement
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Syft + Grype (SBOM & Vulnerability Scanning)

**Purpose:** Syft generates a Software Bill of Materials (SBOM) — a complete inventory of every package, library, and binary in a container image or directory. Grype scans that SBOM against vulnerability databases (NVD, GitHub Advisory, OSV) to find known CVEs. The two-step Syft → Grype workflow is preferred when you want to store SBOMs as artefacts and scan them separately, or feed them to Dependency-Track for continuous monitoring.

```bash
# Install via Nix
nix-env -iA nixpkgs.syft nixpkgs.grype
```

##### Generate an SBOM

```bash
# SBOM for a container image (CycloneDX JSON)
syft jellyfin/jellyfin:latest -o cyclonedx-json > jellyfin-sbom.cdx.json

# SBOM for a local directory
syft dir:/home/user/myapp -o spdx-json > myapp-sbom.spdx.json

# Quick package list (table format)
syft nginx:alpine -o table
```

#### Scan for CVEs
```bash
# Scan an image directly
grype jellyfin/jellyfin:latest

# Scan a previously generated SBOM
grype sbom:jellyfin-sbom.cdx.json

# Fail CI on critical CVEs
grype nginx:alpine --fail-on critical

# JSON output for automation
grype nginx:alpine -o json > nginx-vulns.json
```

#### CI integration
```yaml
# .forgejo/workflows/sbom.yml
steps:
  - name: Generate SBOM
    image: anchore/syft:latest
    commands:
      - syft . -o cyclonedx-json > sbom.cdx.json

  - name: Scan CVEs
    image: anchore/grype:latest
    commands:
      - grype sbom:sbom.cdx.json --fail-on critical
```

---

## Dependency-Track (SBOM Management Platform)

**Purpose:** Continuous SBOM analysis platform. Ingest SBOMs from Syft, Trivy, or your CI pipeline, and Dependency-Track continuously monitors them against NVD, OSV, GitHub Advisory, and VulnDB — alerting you when a new CVE is published that affects a component in any registered project. Unlike point-in-time CI scans, Dependency-Track gives ongoing visibility: a CVE disclosed today against a library ingested a month ago triggers an alert automatically.

```yaml
# ~/dependency-track/compose.yaml
services:
  dtrack-apiserver:
    image: dependencytrack/apiserver:latest
    ports:
      - 127.0.0.1:8081:8080
    volumes:
      - /home/user/dependency-track/data:/data:Z
    environment:
      ALPINE_DATABASE_MODE: internal
    restart: unless-stopped

  dtrack-frontend:
    image: dependencytrack/frontend:latest
    ports:
      - 127.0.0.1:8082:8080
    environment:
      API_BASE_URL: http://localhost:8081
    depends_on: [dtrack-apiserver]
    restart: unless-stopped
```

```bash
cd ~/dependency-track && podman-compose up -d
```

Access at `http://localhost:8082`. Default credentials: `admin` / `admin` — change immediately.

#### Upload an SBOM via API
```bash
SBOM_B64=$(base64 -w 0 myapp-sbom.cdx.json)
curl -X PUT http://localhost:8081/api/v1/bom \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"projectName\":\"myapp\",\"projectVersion\":\"1.0\",\"autoCreate\":true,\"bom\":\"${SBOM_B64}\"}"
```

#### CI — auto-upload SBOM on every build
```yaml
# .woodpecker.yml
steps:
  sbom:
    image: anchore/syft:latest
    commands:
      - syft . -o cyclonedx-json > sbom.cdx.json
  upload:
    image: curlimages/curl:latest
    secrets: [DTRACK_API_KEY]
    commands:
      - |
        curl -X PUT http://dtrack.home.local/api/v1/bom \
          -H "X-Api-Key: $DTRACK_API_KEY" -H "Content-Type: application/json" \
          -d "{\"projectName\":\"${CI_REPO_NAME}\",\"projectVersion\":\"${CI_COMMIT_SHA:0:8}\",\"autoCreate\":true,\"bom\":\"$(base64 -w 0 sbom.cdx.json)\"}"
```

**Caddy:**
```caddyfile
dtrack.home.local { tls internal; reverse_proxy localhost:8082 }
```

---

## Fail2ban (Intrusion Prevention)

**Purpose:** Monitors log files for repeated authentication failures and bans the source IP via firewall rules. Protects SSH, Caddy, Authelia, Vaultwarden, and any service that logs failed login attempts — automatically blocking brute-force attacks without manual intervention. Integrates with `firewalld` (used on this system) natively.

```yaml
# ~/fail2ban/compose.yaml
services:
  fail2ban:
    image: crazymax/fail2ban:latest
    network_mode: host
    volumes:
      - /home/user/fail2ban/config:/data:Z
      - /var/log:/var/log:ro
      - /run/firewalld:/run/firewalld:Z
    environment:
      TZ: Asia/Kolkata
    cap_add:
      - NET_ADMIN
      - NET_RAW
    restart: unless-stopped
```

```bash
cd ~/fail2ban && podman-compose up -d
```

##### Example jail config (`/home/user/fail2ban/config/jail.d/caddy.conf`)

```ini
[caddy-auth]
enabled  = true
port     = http,https
filter   = caddy-auth
logpath  = /var/log/caddy/access.log
maxretry = 5
bantime  = 1h
findtime = 10m
action   = firewallcmd-rich-rules[actiontype=<multiport>]
```

#### Useful commands
```bash
# List banned IPs
podman exec fail2ban fail2ban-client status caddy-auth

# Unban an IP
podman exec fail2ban fail2ban-client set caddy-auth unbanip 1.2.3.4

# Test a filter against a log file
podman exec fail2ban fail2ban-regex /var/log/caddy/access.log caddy-auth
```

> Fail2ban complements CrowdSec — CrowdSec uses community threat intelligence, Fail2ban reacts to your own logs. Run both for defence in depth.

---

## Trivy (Container & Code Security Scanner)

**Purpose:** Comprehensive vulnerability scanner for container images, filesystems, Git repositories, and Kubernetes manifests. Detects known CVEs in OS packages, language libraries (pip, npm, go, cargo), misconfigurations (Dockerfile, Terraform, Helm), and secrets accidentally committed to code. Run it in CI/CD pipelines to gate deployments on security findings.

```bash
# Pull and run Trivy as a one-shot scanner (no persistent container needed)
podman run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /home/user/trivy-cache:/root/.cache/trivy:Z \
  aquasec/trivy:latest image jellyfin/jellyfin:latest

# Scan a local filesystem or Git repo
podman run --rm \
  -v /home/user/myproject:/repo:ro,Z \
  -v /home/user/trivy-cache:/root/.cache/trivy:Z \
  aquasec/trivy:latest fs /repo

# Scan a running container's filesystem
podman run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /home/user/trivy-cache:/root/.cache/trivy:Z \
  aquasec/trivy:latest image --input jellyfin
```

##### Run as a server for CI integration

```yaml
# ~/trivy-server/compose.yaml
services:
  trivy-server:
    image: aquasec/trivy:latest
    ports:
      - 127.0.0.1:4954:4954
    volumes:
      - /home/user/trivy-cache:/root/.cache/trivy:Z
    command: server --listen 0.0.0.0:4954
    restart: unless-stopped
```

```bash
cd ~/trivy-server && podman-compose up -d
```

Then scan from CI with: `trivy image --server http://trivy.home.local:4954 myapp:latest`

> Run Trivy as a weekly scheduled scan across all your container images to catch newly disclosed CVEs before attackers do. Pipe the JSON output to a Grafana dashboard or ntfy alert.

---

## Checkov + tfsec (IaC Security Scanning)

**Purpose:** Static analysis for Infrastructure as Code files — Terraform, Kubernetes YAML, Dockerfiles, Helm charts, GitHub Actions, and Compose files. Catches misconfigurations before they reach production: containers running as root, missing resource limits, secrets in environment variables, public S3 buckets, overly permissive IAM, and hundreds of other checks. Part of a DevSecOps pipeline alongside Trivy (images) and Semgrep (code).

```bash
# Install Checkov via pip (multi-framework: Terraform, K8s, Dockerfile, Helm, GHA, Compose)
pip install checkov --break-system-packages

# Install tfsec via Nix (Terraform-focused, fast, no Python dep — good for pre-commit)
nix-env -iA nixpkgs.tfsec
```

#### Scan Terraform
```bash
# Full scan with CLI + JSON output
checkov -d terraform/ -o cli -o json --output-file-path /dev/null,checkov-results.json

# Fail only on HIGH and CRITICAL
checkov -d terraform/ --soft-fail-on LOW,MEDIUM

# Fast tfsec gate before checkov
tfsec terraform/
tfsec terraform/ --severity CRITICAL --format json --out tfsec-results.json
```

#### Scan Kubernetes manifests and Helm charts
```bash
# Scan raw YAML manifests
checkov -d k8s/ --framework kubernetes

# Scan a Helm chart (renders first, then checks)
checkov -d charts/myapp --framework helm

# Specific checks relevant to K8s security hardening:
# CKV_K8S_6   — do not admit root containers
# CKV_K8S_8   — liveness probe must be defined
# CKV_K8S_9   — readiness probe must be defined
# CKV_K8S_14  — image tag must not be 'latest'
# CKV_K8S_28  — do not allow privileged containers
# CKV_K8S_30  — do not allow privilege escalation
# CKV_K8S_35  — secrets must not be in environment variables
# CKV_K8S_37  — minimise the admission of containers with added capabilities
```

#### Scan Compose files
```bash
# Check compose.yaml for security issues (privileged mode, host network, writable mounts)
checkov -f compose.yaml --framework dockerfile
```

#### CI integration (Forgejo Actions / Woodpecker)
```yaml
# .forgejo/workflows/iac-scan.yml
on: [push]
jobs:
  iac-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Checkov IaC scan
        uses: bridgecrewio/checkov-action@master
        with:
          directory: .
          soft_fail: true          # set to false to block PRs on findings
          output_format: cli,sarif
          output_file_path: console,results.sarif

      - name: tfsec scan
        run: |
          docker run --rm -v "$(pwd):/src" aquasec/tfsec /src/terraform \
            --format json --out /src/tfsec.json || true
```

#### Send findings to Defect Dojo
```bash
# After CI scan, upload JSON results to Defect Dojo for centralised triage
curl -X POST https://defectdojo.home.local/api/v2/import-scan/ \
  -H "Authorization: Token $DEFECTDOJO_API_TOKEN" \
  -F "scan_type=Checkov Scan" \
  -F "file=@checkov-results.json" \
  -F "engagement=$ENGAGEMENT_ID" \
  -F "product_name=infra"
```

> **Checkov vs tfsec:** Use both. Checkov is multi-framework (Terraform + K8s + Dockerfile + Helm + Compose + GHA) and integrates with Defect Dojo natively. tfsec is Terraform-only but faster — run it as a pre-commit gate, Checkov as the full CI scan. Both catch different findings; overlap is intentional.

---

## SLSA Provenance (Supply Chain Security)

**Purpose:** SLSA (Supply chain Levels for Software Artifacts) is a framework for securing your build pipeline. SLSA Level 2 requires that every build produces a signed provenance attestation — a cryptographically signed record of *what was built, from what source, by what pipeline, on what system*. This prevents tampering between source and deployed image. On Shani OS the implementation path is: **Tekton Chains** (provenance generation) + **cosign** (signing) + **Rekor** (transparency log) + **Syft** (SBOM) + **Grype** (vulnerability check on the SBOM).

```bash
# Install cosign via Nix
nix-env -iA nixpkgs.cosign

# Generate a cosign key pair (store private key in OpenBao/Infisical)
cosign generate-key-pair
# Outputs: cosign.key (private — keep secret) and cosign.pub (public — commit to repo)

# Sign an image after pushing to your registry
cosign sign --key cosign.key registry.home.local/myapp:v1.2.3

# Verify a signed image before deploying
cosign verify --key cosign.pub registry.home.local/myapp:v1.2.3

# Attach an SBOM to the image (pairs with Syft)
syft registry.home.local/myapp:v1.2.3 -o cyclonedx-json > sbom.json
cosign attach sbom --sbom sbom.json registry.home.local/myapp:v1.2.3

# Verify the attached SBOM
cosign verify-attestation --key cosign.pub registry.home.local/myapp:v1.2.3
```

#### Tekton Chains (SLSA Level 2 provenance — requires k3s/k0s)
```bash
# Install Tekton Pipelines first (see CI/CD section)
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml

# Install Tekton Chains
kubectl apply -f https://storage.googleapis.com/tekton-releases/chains/latest/release.yaml

# Configure Chains to sign with cosign and store provenance in the OCI registry
kubectl patch configmap chains-config -n tekton-chains -p='{"data":{
  "artifacts.oci.format": "simplesigning",
  "artifacts.oci.storage": "oci",
  "artifacts.taskrun.format": "slsa/v1",
  "artifacts.taskrun.storage": "oci",
  "signers.x509.fulcio.enabled": "false"
}}'

# Create a secret with your cosign key
kubectl create secret generic signing-secrets \
  --from-file=cosign.key=./cosign.key \
  --from-literal=cosign.password="" \
  -n tekton-chains

# After any TaskRun that builds and pushes an image, Chains automatically:
# 1. Captures the build inputs (git commit, Dockerfile, pipeline params)
# 2. Signs the provenance with your cosign key
# 3. Pushes the signed attestation alongside the image in the registry
```

##### Verify provenance in a Kyverno policy (block unsigned images cluster-wide)

```yaml
# ~/k8s/kyverno-verify-image.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signature
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-image-signature
      match:
        any:
          - resources:
              kinds: [Pod]
      verifyImages:
        - imageReferences:
            - "registry.home.local/*"
          attestors:
            - entries:
                - keys:
                    publicKeys: |-
                      -----BEGIN PUBLIC KEY-----
                      <paste contents of cosign.pub here>
                      -----END PUBLIC KEY-----
```

```bash
kubectl apply -f ~/k8s/kyverno-verify-image.yaml

# Test: try deploying an unsigned image — should be blocked
kubectl run test --image=registry.home.local/myapp:unsigned
# Error: image signature verification failed
```

> **SLSA levels in practice:** Level 1 = build script (you probably have this). Level 2 = hosted build + signed provenance (achievable with Tekton Chains + cosign). Level 3 = hardened build platform (Talos + isolated build pods). Start with Level 2 — cosign sign in CI + Kyverno enforce in the cluster — before pursuing Level 3.

---

## Teleport (Zero-Trust Access Platform)

**Purpose:** Self-hosted zero-trust access platform for SSH, Kubernetes, databases, and web applications. Teleport replaces VPN + bastion host setups with identity-aware, audited access — every session is recorded, every login requires a certificate issued for a short TTL, and access can be conditioned on MFA, device trust, and role-based policies. The self-hosted alternative to HashiCorp Boundary or commercial PAM solutions.

```yaml
# ~/teleport/compose.yml
services:
  teleport:
    image: public.ecr.aws/gravitational/teleport:latest
    ports:
      - "0.0.0.0:3023:3023"   # SSH proxy
      - "0.0.0.0:3024:3024"   # SSH tunnel
      - "0.0.0.0:3025:3025"   # Auth server
      - "0.0.0.0:3080:3080"   # HTTPS Web UI + API
    volumes:
      - /home/user/teleport/config:/etc/teleport:Z
      - /home/user/teleport/data:/var/lib/teleport:Z
    command: teleport start --config=/etc/teleport/teleport.yaml
    restart: unless-stopped
```

```bash
cd ~/teleport && podman-compose up -d
```

##### Generate initial config

```bash
podman run --rm \
  -v /home/user/teleport/config:/etc/teleport:Z \
  public.ecr.aws/gravitational/teleport:latest \
  teleport configure \
    --cluster-name=home.example.com \
    --public-addr=teleport.example.com:3080 \
    --data-dir=/var/lib/teleport \
    -o /etc/teleport/teleport.yaml
```

##### Minimal `teleport.yaml`

```yaml
teleport:
  data_dir: /var/lib/teleport
  log:
    output: stderr
    severity: INFO

auth_service:
  enabled: true
  cluster_name: home.example.com
  listen_addr: 0.0.0.0:3025
  tokens:
    - "node:your-join-token"

ssh_service:
  enabled: true
  listen_addr: 0.0.0.0:3022

proxy_service:
  enabled: true
  listen_addr: 0.0.0.0:3023
  web_listen_addr: 0.0.0.0:3080
  public_addr: teleport.example.com:3080
  https_cert: /etc/teleport/certs/fullchain.pem
  https_key: /etc/teleport/certs/privkey.pem
```

**Create the first admin user:**
```bash
podman exec teleport tctl users add admin --roles=editor,access --logins=root,user
# Follow the invite URL printed to set a password and enrol MFA
```

#### Add a server node (install Teleport agent on target host)
```bash
# On the target server
curl https://goteleport.com/static/install.sh | bash
teleport node configure \
  --auth-server=teleport.example.com:3025 \
  --token=your-join-token \
  --output=/etc/teleport.yaml
systemctl enable --now teleport
```

#### Connect via `tsh` (Teleport shell client)
```bash
# Login
tsh login --proxy=teleport.example.com:3080 --user=admin

# List registered nodes
tsh ls

# SSH to a registered node
tsh ssh root@my-server

# Forward a database port
tsh db connect my-postgres

# Session is recorded and viewable in the web UI
```

**Firewall:**
```bash
sudo firewall-cmd --add-port=3023-3025/tcp --add-port=3080/tcp --permanent
sudo firewall-cmd --reload
```

> For homelab use, Teleport Community Edition is free and covers SSH access, session recording, and web application proxy. Run it on a small public VPS (not on your home server) so it stays reachable even if your home connection goes down.

---

## Coraza WAF (Embedded WAF for Caddy)

**Purpose:** OWASP-compliant Web Application Firewall embedded directly in Caddy as a plugin. Runs the OWASP Core Rule Set (CRS) — the industry-standard ruleset that blocks SQL injection, XSS, command injection, path traversal, and hundreds of other attack classes — without an extra reverse proxy hop. Coraza is the modern, Go-native successor to ModSecurity and the recommended WAF for Shani OS because it integrates with the Caddy you are already running.

#### Build a Caddy image with Coraza
```bash
podman build -t caddy-coraza - << 'EOF'
FROM caddy:builder AS builder
RUN xcaddy build \
    --with github.com/corazawaf/coraza-caddy/v2

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
EOF
```

##### Download the OWASP CRS ruleset

```bash
mkdir -p /home/user/caddy/waf/crs
curl -L https://github.com/coreruleset/coreruleset/archive/refs/tags/v4.7.0.tar.gz \
  | tar -xz -C /home/user/caddy/waf/crs --strip-components=1
```

##### Run the custom Caddy image

```yaml
# ~/caddy/compose.yaml
services:
  caddy:
    image: caddy-coraza
    ports:
      - 80:80
      - 443:443
    volumes:
      - /home/user/caddy/Caddyfile:/etc/caddy/Caddyfile:ro,Z
      - /home/user/caddy/data:/data:Z
      - /home/user/caddy/config:/config:Z
      - /home/user/caddy/waf:/etc/coraza-waf:Z
    restart: unless-stopped
```

```bash
cd ~/caddy && podman-compose up -d
```

#### Caddyfile with WAF enabled for a specific service
```caddyfile
{
  order coraza_waf first
}

app.example.com {
  coraza_waf {
    load_owasp_crs
    directives `
      Include /etc/coraza-waf/crs/crs-setup.conf.example
      Include /etc/coraza-waf/crs/rules/*.conf
      SecRuleEngine On
      SecRequestBodyAccess On
      SecResponseBodyAccess On
      SecAuditEngine RelevantOnly
      SecAuditLog /var/log/caddy/coraza-audit.log
      SecAuditLogFormat JSON
      SecDefaultAction "phase:2,log,auditlog,deny,status:403"
    `
  }
  reverse_proxy localhost:8080
}
```

##### Tune detection sensitivity

— start at paranoia level 1 and raise gradually after reviewing false positives:
```
# In crs-setup.conf.example — set the paranoia level
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.paranoia_level=1"
```

#### Suppress a rule causing false positives
```
SecRuleRemoveById 941100         # Remove a specific rule by ID
SecRuleRemoveByTag "attack-sqli" # Remove all SQLi rules
```

> Set `SecRuleEngine DetectionOnly` while tuning — this logs violations without blocking, so you can identify false positives before going live. Switch to `SecRuleEngine On` once stable.

---

## SafeLine WAF (Standalone WAF with Web UI)

**Purpose:** Self-contained WAF with a polished dashboard, sitting in front of your apps as its own reverse proxy. Built on nginx with a semantic detection engine. Easier to configure than Coraza for users who prefer a GUI. Use it when you want WAF + reverse proxy in one product rather than Coraza embedded in Caddy.

```yaml
# ~/safeline/compose.yml
services:
  safeline-mgt:
    image: chaitin/safeline-mgt:latest
    ports: ["127.0.0.1:9443:1443"]
    environment:
      MGT_PG: "host=safeline-pg port=5432 user=safeline password=changeme dbname=safeline_mgt sslmode=disable"
      DISABLE_SIGNUP: "true"
    volumes:
      - /home/user/safeline/resources:/resources:Z
      - /home/user/safeline/logs:/logs:Z
      - /home/user/safeline/nginx:/etc/nginx:Z
    depends_on: [safeline-pg]
    restart: unless-stopped

  safeline-tengine:
    image: chaitin/safeline-tengine:latest
    ports:
      - "0.0.0.0:80:80"
      - "0.0.0.0:443:443"
    environment:
      TCD_MGT_API: https://safeline-mgt:1443
    volumes:
      - /home/user/safeline/resources:/resources:Z
      - /home/user/safeline/logs:/logs:Z
      - /home/user/safeline/nginx:/etc/nginx:Z
    depends_on: [safeline-mgt]
    restart: unless-stopped

  safeline-detector:
    image: chaitin/safeline-detector:latest
    volumes:
      - /home/user/safeline/resources:/resources:Z
      - /home/user/safeline/logs/detector:/logs/detector:Z
    restart: unless-stopped

  safeline-pg:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: safeline
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: safeline_mgt
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/safeline && podman-compose up -d
```

Access the admin UI at `https://localhost:9443`. Add your upstream services as protected sites and configure detection sensitivity per service.

---

## Suricata (Network IDS/IPS)

**Purpose:** High-performance Network Intrusion Detection and Prevention System (IDS/IPS). Suricata inspects raw network traffic using the Emerging Threats and ETPRO rule sets to detect port scans, exploit attempts, C2 beaconing, DNS tunnelling, and malware traffic patterns — not just failed logins like Fail2ban and CrowdSec, but actual wire-level attack signatures. In IPS mode it drops malicious packets before they reach your services. In IDS mode it logs and alerts without blocking, which is safer to start with.

```yaml
# ~/suricata/compose.yaml
services:
  suricata:
    image: jasonish/suricata:latest
    network_mode: host
    volumes:
      - /home/user/suricata/config:/etc/suricata:Z
      - /home/user/suricata/logs:/var/log/suricata:Z
      - /home/user/suricata/rules:/var/lib/suricata/rules:Z
    environment:
      SURICATA_OPTIONS: -i eth0
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_NICE
    restart: unless-stopped
```

```bash
cd ~/suricata && podman-compose up -d
```

> Replace `eth0` with your primary interface (`ip link show`). `--network host` is required to see actual traffic.

#### Update rules (Emerging Threats Open — free)
```bash
podman exec suricata suricata-update update-sources
podman exec suricata suricata-update enable-source et/open
podman exec suricata suricata-update
podman exec suricata kill -USR2 1  # Reload rules live
```

##### Minimal `suricata.yaml` additions for homelab

```yaml
# /home/user/suricata/config/suricata.yaml
outputs:
  - eve-log:
      enabled: yes
      filename: /var/log/suricata/eve.json
      types:
        - alert
        - dns
        - http
        - tls

af-packet:
  - interface: eth0
    threads: auto
    cluster-id: 99
    cluster-type: cluster_flow
    defrag: yes

# IDS mode (detection only — safe to start)
# For IPS mode, switch to nfqueue and set drop policy
detect:
  profile: medium
  custom-values:
    toclient-groups: 3
    toserver-groups: 25
```

#### Forward alerts to CrowdSec or ntfy
```bash
# Watch eve.json and forward critical alerts to ntfy
tail -f /home/user/suricata/logs/eve.json | \
  jq -c 'select(.event_type=="alert" and .alert.severity==1)' | \
  while read -r line; do
    curl -s -d "Suricata alert: $(echo $line | jq -r '.alert.signature')" \
      http://localhost:8090/suricata-alerts
  done
```

> Pair Suricata (network-level IDS) with Wazuh (host-level SIEM) and CrowdSec (IP reputation + blocking) for layered defence. Suricata sees what's happening on the wire; Wazuh sees what's happening inside your hosts.

---

## OWASP ZAP (Web Application Scanner)

**Purpose:** OWASP's flagship dynamic application security testing (DAST) tool. ZAP proxies traffic between your browser and your apps, passively analysing every request, and can actively probe for SQLi, XSS, SSRF, broken auth, insecure redirects, and 100+ other vulnerabilities. Use it to audit your self-hosted services before exposing them publicly, and in CI/CD pipelines to catch regressions.

##### Run as a daemon with REST API

```yaml
# ~/zap/compose.yaml
services:
  zap:
    image: ghcr.io/zaproxy/zaproxy:stable
    ports:
      - 127.0.0.1:8088:8080
    volumes:
      - /home/user/zap:/zap/wrk:Z
    command: >
      zap.sh -daemon -port 8080 -host 0.0.0.0
      -config api.addrs.addr.name=.*
      -config api.addrs.addr.regex=true
      -config api.key=changeme
    restart: unless-stopped
```

```bash
cd ~/zap && podman-compose up -d
```

#### Scan types
```bash
# Baseline scan — passive only, safe to run against production
podman run --rm \
  -v /home/user/zap/reports:/zap/wrk:Z \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://app.home.local \
    -r /zap/wrk/baseline-report.html

# Full active scan — probes for vulnerabilities, run against test/staging only
podman run --rm \
  -v /home/user/zap/reports:/zap/wrk:Z \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-full-scan.py -t https://app.home.local \
    -r /zap/wrk/full-report.html

# API scan — OpenAPI/Swagger-aware
podman run --rm \
  -v /home/user/zap/reports:/zap/wrk:Z \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t https://app.home.local/openapi.json \
    -f openapi -r /zap/wrk/api-report.html
```

> Run baseline scans in CI/CD on every deployment to staging. Reserve full active scans for dedicated security review cycles — they generate significant traffic and may disrupt services.

---

## Defect Dojo (Vulnerability Management)

**Purpose:** Centralised vulnerability management platform. Aggregates security findings from Trivy, Semgrep, OWASP ZAP, Nuclei, Greenbone, and other scanners into one triage dashboard with deduplication, risk scoring, SLA tracking, and JIRA/Slack integration. The self-hosted alternative to paying for a dedicated AppSec platform.

```yaml
# ~/defectdojo/compose.yaml
services:
  django:
    image: defectdojo/defectdojo-django:latest
    ports:
      - 127.0.0.1:8080:8080
    environment:
      DD_DATABASE_URL: postgresql://defectdojo:changeme@postgres:5432/defectdojo
      DD_SECRET_KEY: changeme-run-openssl-rand-base64-42
      DD_CREDENTIAL_AES_256_KEY: changeme-16chars
      DD_ALLOWED_HOSTS: defectdojo.home.local
      DD_CELERY_BROKER_URL: redis://redis:6379/0
      DD_SOCIAL_AUTH_KEYCLOAK_ENABLED: "False"
    volumes:
      - /home/user/defectdojo/media:/app/media:Z
    depends_on: [postgres, redis]
    restart: unless-stopped

  celeryworker:
    image: defectdojo/defectdojo-django:latest
    command: /entrypoint-celery-worker.sh
    environment:
      DD_DATABASE_URL: postgresql://defectdojo:changeme@postgres:5432/defectdojo
      DD_SECRET_KEY: changeme-run-openssl-rand-base64-42
      DD_CELERY_BROKER_URL: redis://redis:6379/0
    depends_on: [postgres, redis]
    restart: unless-stopped

  nginx:
    image: defectdojo/defectdojo-nginx:latest
    ports:
      - 127.0.0.1:8081:8080
    depends_on: [django]
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: defectdojo
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: defectdojo
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/defectdojo && podman-compose up -d
```

##### Initialise the database (first run)

```bash
podman-compose run --rm django bash -c "python manage.py migrate && python manage.py createsuperuser"
```

Access at `http://localhost:8081`. Create a Product, then import scanner results under Findings → Import Scan Results — select the scanner type (Trivy, Semgrep SARIF, ZAP XML, Nuclei JSON) and upload the output file.

**Caddy:**
```caddyfile
defectdojo.home.local { tls internal; reverse_proxy localhost:8081 }
```

---

## osquery (Host Security Monitoring & Query Language)

**Purpose:** Treats your OS as a relational database — query processes, network connections, users, kernel modules, cron jobs, loaded kernel extensions, open files, and hardware state using plain SQL. Used by security teams for threat hunting, compliance auditing, and incident response. Feeds into Wazuh, Elastic SIEM, and Splunk for centralised host visibility.

```bash
# Install osquery via Nix (installs osqueryi + osqueryd)
nix-env -iA nixpkgs.osquery

# Or via the official RPM/DEB on non-immutable systems
# On Shani OS: Nix only (OS root is read-only)
```

#### Interactive queries (`osqueryi`)
```sql
-- Running processes and their open network connections
SELECT p.pid, p.name, p.cmdline, lp.port, lp.protocol, lp.address
FROM processes AS p JOIN listening_ports AS lp USING (pid)
WHERE lp.port > 0;

-- All users with a valid login shell (spot rogue accounts)
SELECT username, uid, gid, description, directory, shell
FROM users WHERE shell NOT LIKE '%nologin%' AND shell NOT LIKE '%false%';

-- Currently established outbound connections (threat hunting)
SELECT pid, remote_address, remote_port, local_port, state
FROM process_open_sockets
WHERE remote_address NOT IN ('0.0.0.0', '::')
  AND state = 'ESTABLISHED';

-- Cron jobs (detect persistence mechanisms)
SELECT event, minute, hour, day_of_month, month, day_of_week, command, path
FROM crontab;

-- Loaded kernel modules (detect rootkits)
SELECT name, size, used_by FROM kernel_modules ORDER BY name;

-- Recently modified files in /etc (detect config tampering)
SELECT path, mtime, atime, ctime, sha256
FROM file
WHERE path LIKE '/etc/%' AND mtime > (strftime('%s', 'now') - 3600);

-- Listening ports and processes (quick attack surface audit)
SELECT DISTINCT lp.port, lp.protocol, lp.address, p.name, p.cmdline
FROM listening_ports AS lp JOIN processes AS p USING (pid)
ORDER BY lp.port;

-- Docker/Podman containers (detect container escapes)
SELECT id, name, image, status, created
FROM docker_containers;

-- SSH authorized keys (audit backdoor keys)
SELECT username, key_file, key, comment FROM user_ssh_keys;

-- Installed packages (software inventory for CVE mapping)
SELECT name, version, arch FROM deb_packages;   -- Debian/Ubuntu
-- or
SELECT name, version, arch FROM rpm_packages;   -- RHEL/Fedora

-- Processes with root UID not launched by root
SELECT pid, name, uid, gid, root, cmdline
FROM processes WHERE uid = 0 AND parent != 1;
```

#### Continuous monitoring with `osqueryd` (daemon mode)
```bash
# /etc/osquery/osquery.conf
{
  "options": {
    "logger_plugin": "filesystem",
    "logger_path": "/var/log/osquery",
    "disable_logging": "false",
    "log_result_events": "true",
    "schedule_splay_percent": "10",
    "utc": "true"
  },
  "schedule": {
    "process_events": {
      "query": "SELECT pid, name, cmdline, uid, gid FROM process_events;",
      "interval": 60
    },
    "listening_ports": {
      "query": "SELECT pid, port, protocol, address FROM listening_ports;",
      "interval": 300,
      "removed": false
    },
    "socket_events": {
      "query": "SELECT action, auid, family, remote_address, remote_port, local_address, local_port, path FROM socket_events WHERE action = 'connect';",
      "interval": 60
    },
    "file_events": {
      "query": "SELECT path, action, transaction_id FROM file_events WHERE path LIKE '/etc/%' OR path LIKE '/home/%/.ssh/%';",
      "interval": 30
    },
    "users": {
      "query": "SELECT uid, username, description, shell FROM users;",
      "interval": 600,
      "removed": false
    }
  },
  "file_paths": {
    "config_files": ["/etc/%%"],
    "ssh_keys": ["/home/%/.ssh/%%"]
  }
}
```

```bash
# Start osqueryd
sudo systemctl enable --now osqueryd

# View osquery logs
sudo tail -f /var/log/osquery/osqueryd.results.log | python3 -m json.tool

# Forward osquery logs to Wazuh (add to wazuh-agent config)
# /var/ossec/etc/ossec.conf — add a localfile block:
# <localfile>
#   <log_format>json</log_format>
#   <location>/var/log/osquery/osqueryd.results.log</location>
# </localfile>
```

#### Fleet (Multi-host osquery management UI)
```yaml
# ~/fleet/compose.yaml
services:
  fleet:
    image: fleetdm/fleet:latest
    ports: ["127.0.0.1:8412:8080"]
    environment:
      FLEET_MYSQL_ADDRESS: mysql:3306
      FLEET_MYSQL_DATABASE: fleet
      FLEET_MYSQL_USERNAME: fleet
      FLEET_MYSQL_PASSWORD: changeme
      FLEET_REDIS_ADDRESS: redis:6379
      FLEET_SERVER_ADDRESS: 0.0.0.0:8080
      FLEET_LOGGING_JSON: "true"
    depends_on: [mysql, redis]
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: fleet
      MYSQL_USER: fleet
      MYSQL_PASSWORD: changeme
    volumes: [mysql_data:/var/lib/mysql]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  mysql_data:
```

```bash
cd ~/fleet && podman-compose up -d
# Initialise Fleet DB
podman-compose run --rm fleet fleet prepare db --config /etc/fleet/fleet.yml
```

---

## Nuclei (Fast Vulnerability & Exposure Scanner)

**Purpose:** Template-based vulnerability scanner — runs 9,000+ community-maintained YAML templates against HTTP/HTTPS targets, detecting misconfigurations, CVEs, exposed panels, default credentials, path traversal, SSRF, CORS misconfig, and hundreds of other issues. Faster and more scriptable than OWASP ZAP for specific CVE checks and exposure detection. Feed results into Defect Dojo.

```bash
# Install via Nix
nix-env -iA nixpkgs.nuclei

# Or install the latest binary directly
sh -c "$(curl -fsSL https://nuclei.projectdiscovery.io/install.sh)"

# Update templates (run before first scan and weekly)
nuclei -update-templates
```

#### Common scan patterns
```bash
# Scan a single target with all templates
nuclei -u https://app.example.com

# Scan only for critical and high severity findings
nuclei -u https://app.example.com -s critical,high

# Scan for specific CVEs (e.g., recently published)
nuclei -u https://app.example.com -tags cve -s critical,high

# Scan multiple targets from a file
nuclei -l targets.txt -s critical,high -o findings.json -j

# Scan with specific technology templates (e.g., nginx, wordpress)
nuclei -u https://example.com -tags nginx,apache

# Scan for exposed admin panels and default credentials
nuclei -u https://example.com -tags panel,default-login

# Scan internal services (homelab sweep)
nuclei -l internal-hosts.txt -tags misconfig,exposure,default-login \
  -s medium,high,critical -o internal-scan.json -j

# Run a fast sweep with concurrency controls
nuclei -l targets.txt -c 20 -rate-limit 100 -timeout 10 \
  -s high,critical -j -o output.json

# Template-specific scan (single CVE check)
nuclei -u https://example.com \
  -t cves/2023/CVE-2023-44487.yaml   # HTTP/2 Rapid Reset

# Silent mode + JSON (for CI pipeline output)
nuclei -u https://staging.example.com \
  -s critical,high -silent -j -o nuclei-report.json

# Fail CI if any critical findings
[ "$(jq '[.[] | select(.info.severity=="critical")] | length' nuclei-report.json)" -eq 0 ] \
  || { echo "Critical findings detected!"; exit 1; }
```

#### Woodpecker CI integration
```yaml
# .woodpecker.yml — add Nuclei scan after deployment to staging
- name: security-scan
  image: projectdiscovery/nuclei:latest
  commands:
    - nuclei -u https://staging.example.com
        -s critical,high -silent -j -o /tmp/nuclei.json
    - |
      CRITS=$(jq '[.[] | select(.info.severity=="critical")] | length' /tmp/nuclei.json)
      if [ "$CRITS" -gt 0 ]; then
        echo "FAIL: $CRITS critical findings"; cat /tmp/nuclei.json | jq '.info.name, .info.severity, .matched-at'; exit 1
      fi
```

#### Key template categories for DevOps/homelab

| Tag | What it detects |
|-----|----------------|
| `misconfig` | CORS, security header gaps, path traversal |
| `default-login` | Admin/admin, admin/password on 1,000+ apps |
| `exposure` | Exposed `.git`, `.env`, backup files, debug endpoints |
| `cve` | Known CVEs with public PoCs |
| `panel` | Admin panels exposed without auth |
| `takeover` | Subdomain/dangling DNS takeover opportunities |
| `tech` | Technology fingerprinting |
| `ssl` | TLS misconfigurations, expired certs, weak ciphers |

---

## Semgrep (SAST — Static Application Security Testing)

**Purpose:** Fast, pattern-based static analysis for code and IaC. Finds real bugs and security vulnerabilities in Python, Go, JavaScript, TypeScript, Java, Ruby, PHP, and 30+ other languages using declarative rules. Unlike compiler-aware SASTs (Checkmarx, Coverity), Semgrep is fast enough to run in CI on every push. Use for: OWASP A03 (injection), A05 (misconfiguration), A08 (integrity), and custom business logic rules. Output feeds into Defect Dojo as SARIF.

```bash
# Install via Nix
nix-env -iA nixpkgs.semgrep

# Or via pip
pip install semgrep --break-system-packages
```

#### Common scan patterns
```bash
# Scan with the auto ruleset (recommended default — curated OSS rules)
semgrep --config=auto .

# Scan with the security-focused OWASP ruleset
semgrep --config=p/owasp-top-ten .

# Scan with community Go rules (language-specific)
semgrep --config=p/golang .

# Scan with Python security rules
semgrep --config=p/python .

# CI scan — output SARIF for upload to GitHub/Defect Dojo
semgrep --config=auto --sarif --output=semgrep.sarif .

# CI scan — JSON output
semgrep --config=p/security-audit --json --output=semgrep.json .

# Only show error-severity findings (fail CI on these)
semgrep --config=auto --severity=ERROR --error .

# Scan IaC files (Terraform, Dockerfiles)
semgrep --config=p/terraform --config=p/dockerfile .

# Scan secrets (hardcoded API keys, tokens, passwords)
semgrep --config=p/secrets .

# Custom rule (inline — detect SQL string concatenation)
semgrep --pattern 'query = "..." + $X' --lang python .
```

#### Writing custom Semgrep rules
```yaml
# ~/.semgrep/custom-rules.yaml
rules:
  - id: hardcoded-db-password
    patterns:
      - pattern: |
          DB_PASSWORD = "$PASS"
      - pattern-not: |
          DB_PASSWORD = os.environ[...]
    message: "Hardcoded database password — use environment variables"
    languages: [python]
    severity: ERROR
    metadata:
      cwe: "CWE-798"
      owasp: "A02:2021"

  - id: subprocess-shell-true
    pattern: subprocess.run(..., shell=True, ...)
    message: "shell=True with subprocess is a command injection risk — use a list"
    languages: [python]
    severity: WARNING
    metadata:
      cwe: "CWE-78"

  - id: jwt-none-alg
    pattern: jwt.decode($TOKEN, options={"verify_signature": False, ...})
    message: "JWT signature verification disabled — attacker can forge tokens"
    languages: [python]
    severity: ERROR
```

```bash
# Run custom rules
semgrep --config=~/.semgrep/custom-rules.yaml .

# Combine auto with custom
semgrep --config=auto --config=~/.semgrep/custom-rules.yaml .
```

#### Woodpecker CI integration (SAST gate on every PR)
```yaml
# .woodpecker.yml
- name: sast-semgrep
  image: returntocorp/semgrep:latest
  commands:
    - semgrep --config=p/security-audit --config=p/secrets
        --severity=ERROR --error
        --sarif --output=semgrep.sarif .
  when:
    event: [push, pull_request]
```

#### Semgrep vs Checkov vs tfsec

| Tool | Focus | Best for |
|------|-------|---------|
| Semgrep | Application code + IaC | Python/Go/JS bugs, injection, secrets in code |
| Checkov | IaC (multi-framework) | Terraform, K8s YAML, Dockerfile, Helm policy |
| tfsec | Terraform-only | Fast Terraform security gate |

Use all three in CI: Semgrep for code, Checkov for IaC policy, tfsec for Terraform speed gate. Feed SARIF output from all three into Defect Dojo.

---

## SOPS + age (Secrets Encryption for Git)

**Purpose:** SOPS (Secrets OPerationS) encrypts specific values in YAML/JSON/ENV/TOML/INI files — the keys remain readable (for diffs and reviews) but values are ciphertext. Committed to Git safely. `age` is the modern, simple encryption backend (replaces GPG). Used to store Kubernetes Secrets, Terraform variables, Ansible vault alternatives, and `.env` files in Git without exposing secrets. Works natively with FluxCD and ArgoCD via the KSOPS or flux-system plugins.

```bash
# Install SOPS + age via Nix
nix-env -iA nixpkgs.sops nixpkgs.age
```

#### Key setup
```bash
# Generate an age key pair (one per person/machine)
age-keygen -o ~/.config/sops/age/keys.txt
# Public key output: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p

# Set the env var so SOPS can find your private key
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
# Add to ~/.bashrc or ~/.zshrc to persist

# Create a .sops.yaml in your repo root to define who can decrypt
cat > .sops.yaml << 'EOF'
creation_rules:
  - path_regex: .*\.secrets\.yaml$
    age: >-
      age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p,
      age1another_teammate_public_key_here
  - path_regex: k8s/.*secrets.*\.yaml$
    age: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
EOF
```

#### Encrypting and editing secrets
```bash
# Encrypt a new secrets file (SOPS reads .sops.yaml for the key config)
sops --encrypt --in-place secrets.yaml
# or equivalently (SOPS detects .sops.yaml automatically):
sops -e -i secrets.yaml

# Edit an encrypted file in-place (decrypts to $EDITOR, re-encrypts on save)
sops secrets.yaml

# Decrypt to stdout (pipe to kubectl apply)
sops -d secrets.yaml | kubectl apply -f -

# Decrypt to a file (for local testing — never commit the decrypted file!)
sops -d secrets.yaml > /tmp/secrets-plain.yaml

# Encrypt a single value on the command line
sops -e --input-type raw --output-type raw <(echo "my-secret-value")

# Encrypt a Kubernetes Secret manifest
sops -e -i k8s/myapp-secret.yaml

# Apply encrypted K8s secret directly
sops -d k8s/myapp-secret.yaml | kubectl apply -f -
```

##### Example encrypted YAML structure

```yaml
# app.secrets.yaml (after sops -e -i)
database:
    host: db.home.local          # not encrypted — key only
    password: ENC[AES256_GCM,data:xyz123...,type:str]
    port: 5432                   # not encrypted — not sensitive
api_keys:
    stripe: ENC[AES256_GCM,data:abc456...,type:str]
    sendgrid: ENC[AES256_GCM,data:def789...,type:str]
sops:
    age:
        - recipient: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
          enc: |
            -----BEGIN AGE ENCRYPTED FILE-----
            ...
```

#### SOPS with Flux CD (GitOps secrets decryption in-cluster)
```bash
# Create a Flux decryption secret from your age private key
cat ~/.config/sops/age/keys.txt | kubectl create secret generic sops-age \
  --namespace=flux-system \
  --from-file=age.agekey=/dev/stdin

# Add a .sops.yaml to your GitOps repo root (as above)

# Add a Kustomization with decryption enabled
cat > k8s/flux-system/kustomization.yaml << 'EOF'
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: myapp
  namespace: flux-system
spec:
  interval: 10m
  path: ./k8s/myapp
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  decryption:
    provider: sops
    secretRef:
      name: sops-age
EOF
```

#### SOPS with Ansible (replace ansible-vault)
```bash
# Encrypt your vars file
sops -e -i group_vars/all/vault.yaml

# Decrypt before running playbook (or pipe directly)
sops -d group_vars/all/vault.yaml > /tmp/vault-plain.yaml
ansible-playbook -i inventory.ini playbook.yaml \
  -e @/tmp/vault-plain.yaml; rm /tmp/vault-plain.yaml

# Or use sops exec-env to inject vars as environment variables
sops exec-env secrets.env ansible-playbook playbook.yaml
```

#### SOPS with Terraform / OpenTofu
```bash
# Decrypt a .tfvars secrets file, pass to tofu
sops -d prod.secrets.tfvars.enc > /tmp/prod.secrets.tfvars
tofu apply -var-file=prod.secrets.tfvars -var-file=/tmp/prod.secrets.tfvars
rm /tmp/prod.secrets.tfvars

# Or use the terraform-sops provider
# In main.tf:
# data "sops_file" "secrets" { source_file = "secrets.sops.yaml" }
# resource "..." { password = data.sops_file.secrets.data["db_password"] }
```

#### `.gitignore` additions when using SOPS
```gitignore
# Never commit decrypted secrets — only commit *.sops.yaml or *.enc.yaml
*-plain.yaml
*-decrypted.yaml
/tmp/*.yaml
```

> **Key rotation:** When a team member leaves, re-encrypt all SOPS files with their key removed from `.sops.yaml`. Run `sops updatekeys secrets.yaml` to rotate encryption without decrypting/re-encrypting manually — SOPS re-encrypts the data key for the new recipient set.

## Caddy Configuration

```caddyfile
secrets.home.local    { tls internal; reverse_proxy localhost:8090 }
trivy.home.local      { tls internal; reverse_proxy localhost:4954 }
teleport.example.com  { reverse_proxy localhost:3080 }
zap.home.local        { tls internal; reverse_proxy localhost:8088 }
safeline.home.local   { tls internal; reverse_proxy localhost:9443 }
fleet.home.local      { tls internal; reverse_proxy localhost:8412 }
defectdojo.home.local { tls internal; reverse_proxy localhost:8081 }
```

---

## OWASP Top 10 Quick Reference

The OWASP Top 10 is the standard framework for web application security risk. Understanding what each category means helps you configure your scanning tools (ZAP, Semgrep, Trivy) with appropriate scope:

| # | Category | What it means | How to address |
|---|----------|--------------|----------------|
| A01 | **Broken Access Control** | Users can act outside their intended permissions (IDOR, privilege escalation) | Enforce role-based access; deny by default; test all endpoints |
| A02 | **Cryptographic Failures** | Sensitive data exposed due to weak/missing encryption | TLS everywhere; use modern cipher suites; never MD5/SHA1 for passwords |
| A03 | **Injection** | Untrusted data interpreted as code (SQL, LDAP, command injection) | Parameterised queries; input validation; Semgrep SAST rules |
| A04 | **Insecure Design** | Missing security controls at the design level | Threat modelling before building; security requirements in design docs |
| A05 | **Security Misconfiguration** | Default credentials, unnecessary services, verbose error messages | Hardened defaults; remove unused services; ZAP scanner |
| A06 | **Vulnerable Components** | Outdated libraries with known CVEs | Trivy scanning; Renovate for dependency updates; Dependabot |
| A07 | **Auth & Session Failures** | Weak passwords, missing MFA, session fixation | Authelia/Authentik; strong session cookies; MFA everywhere |
| A08 | **Software & Data Integrity** | Untrusted updates, CI/CD pipeline compromise | SLSA provenance; cosign image signing; Kyverno verification |
| A09 | **Logging & Monitoring Failures** | Attacks go undetected due to insufficient logging | Audit logging; Graylog/OpenSearch; Grafana alerts on anomalies |
| A10 | **Server-Side Request Forgery** | Server fetches attacker-controlled URLs, bypassing firewalls | Validate and restrict outbound URLs; network egress controls |

ZAP (below) tests for A01, A02, A03, A05, A07, A10. Semgrep covers A03, A05, A08. Trivy covers A06.

---

## mTLS (Mutual TLS) with Caddy

Standard TLS proves the server's identity to the client. **Mutual TLS (mTLS)** requires the client to also present a certificate, so the server can verify the client's identity. This is the foundation of zero-trust service-to-service authentication.

Use cases on a homelab: restricting an internal API to specific clients (e.g., only your monitoring server can call `/metrics`), protecting admin endpoints without a username/password flow, or securing inter-service communication.

##### Generate a CA and client certificate with Step-CA

```bash
# Install step CLI
nix-env -iA nixpkgs.step-cli

# Create a local CA
step certificate create "Home Lab CA" ca.crt ca.key --profile root-ca --no-password --insecure

# Issue a client certificate valid for 1 year
step certificate create "grafana-client" client.crt client.key \
  --profile leaf --ca ca.crt --ca-key ca.key \
  --not-after 8760h --no-password --insecure
```

##### Configure Caddy to require a client certificate

```caddyfile
# ~/caddy/Caddyfile
api.home.local {
  tls internal
  tls {
    client_auth {
      mode require_and_verify
      trusted_ca_cert_file /etc/caddy/client-ca.crt
    }
  }
  reverse_proxy localhost:8080
}
```

```bash
# Copy the CA cert into the Caddy config directory
cp ca.crt ~/caddy/client-ca.crt
cd ~/caddy && podman-compose restart
```

##### Test with the client certificate

```bash
# Without cert — rejected
curl https://api.home.local/health

# With cert — allowed
curl --cert client.crt --key client.key https://api.home.local/health
```

---

## Pod Security Standards

Pod Security Standards (PSS) replaced PodSecurityPolicies in Kubernetes 1.25. PSS defines three policy levels enforced at the namespace level via labels — no webhook or CRD required.

| Level | What it restricts |
|-------|------------------|
| **Privileged** | No restrictions — for trusted system workloads |
| **Baseline** | Blocks the most dangerous configurations (privileged containers, hostNetwork, hostPID) |
| **Restricted** | Requires non-root user, drops all capabilities, enforces read-only root filesystem |

```yaml
# Label a namespace to enforce the restricted policy
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted     # reject violating pods
    pod-security.kubernetes.io/warn: restricted        # warn even if not enforced
    pod-security.kubernetes.io/audit: restricted       # log violations to audit log
```

```bash
# Check which namespaces have PSS labels
kubectl get namespaces -o json | jq -r '.items[] | select(.metadata.labels | has("pod-security.kubernetes.io/enforce")) | "\(.metadata.name): \(.metadata.labels["pod-security.kubernetes.io/enforce"])"'

# Dry-run: what would be blocked in this namespace?
kubectl label namespace myapp \
  pod-security.kubernetes.io/enforce=restricted \
  --dry-run=server
```

Start with `warn` mode on existing namespaces to discover violations without breaking anything, then migrate to `enforce` once pods are compliant. Use Kyverno policies (documented elsewhere in the Kubernetes wiki) for more granular control beyond what PSS provides.

---

## Secrets Rotation Workflow

Rotating a secret without restarting every pod that uses it requires a coordinated flow between your secrets store and the Kubernetes secrets layer. With External Secrets Operator (ESO):

1. **Rotate the secret in OpenBao or Infisical** — update the value in the secrets engine. The old value is no longer valid.

2. **ESO syncs automatically** — ESO polls the external store on the `refreshInterval` (default: 1h, configurable per `ExternalSecret`). To force immediate sync:
   ```bash
   kubectl annotate externalsecret myapp-secret \
     force-sync=$(date +%s) \
     --overwrite -n myapp
   ```

3. **Kubernetes Secret is updated** — ESO updates the `Secret` object in Kubernetes with the new value.

4. **Application picks up the new value** — depends on how the secret is consumed:
   - **Volume mount** — Kubernetes updates the mounted file automatically within 60–90 seconds (kubelet sync period). The application must watch the file for changes or be restarted.
   - **Environment variable** — environment variables are set at pod startup. The pod must be restarted to see the new value: `kubectl rollout restart deployment/myapp`
   - **Reloader** — use [Reloader](https://github.com/stakater/Reloader) to automatically restart pods when their referenced Secret changes:
     ```yaml
     # Add annotation to your Deployment
     annotations:
       reloader.stakater.com/auto: "true"
     ```

The full flow from rotate to running with new value takes: ESO sync interval + Kubernetes propagation delay + pod restart time. Reduce `refreshInterval` on high-sensitivity secrets.

---

## Supply Chain Attack Vectors

The SLSA provenance and cosign signing setup (documented above) defends against specific supply chain attacks. Understanding the vectors helps you prioritise:

**Typosquatting:** — a malicious image `ngiinx:latest` or package `lodahs` waiting for a typo. Mitigation: use a private registry mirror that only allows approved images; pin images to digests (`nginx@sha256:abc123`) not tags.

**Dependency confusion:** — an attacker publishes a public package with the same name as your internal private package, betting that the build tool resolves the public one. Mitigation: scope all internal packages (e.g., `@mycompany/utils`), configure package managers to only resolve scoped packages from your internal registry.

**Base image poisoning:** — a compromised upstream base image (`FROM node:20`) introduces malware before your build runs. Mitigation: pin base images to their digest; Trivy scan every build; use images from verified publishers; consider distroless bases (smaller surface).

**CI/CD pipeline compromise:** — an attacker gains write access to your CI system and injects malicious build steps. Mitigation: separate build credentials from deployment credentials; use OIDC short-lived tokens instead of long-lived secrets in CI; audit pipeline logs; use Tekton Chains for SLSA attestations.

---

## Vaultwarden Emergency Kit

If you lose access to your Vaultwarden vault (lost 2FA device, forgotten master password), you need recovery options set up *before* the emergency. Bitwarden/Vaultwarden provides two:

**Emergency Access:** — grant a trusted contact the ability to request access to your vault. You have a configurable window (1–90 days) to deny the request. If you don't deny it, they gain read or takeover access. Set this up under *Settings → Emergency Access* while you have normal access.

**Printed Recovery Code (Two-Factor Recovery):** — if you lose your 2FA device, you need a recovery code to bypass 2FA. In Vaultwarden: *Settings → Two-step Login → View Recovery Code*. Print this code or store it in a fireproof safe offline. Without this code and without your 2FA device, your vault is locked permanently — there is no admin bypass.

```bash
# Admin: view all users (confirm emergency access is configured)
curl -H "Authorization: Bearer $VAULTWARDEN_ADMIN_TOKEN" \
  http://localhost:8222/admin/users

# Admin: if a user is completely locked out, disable 2FA for their account
# Go to /admin → Users → [username] → Deactivate two-factor authentication
# Then have the user set up 2FA again from scratch
```

Store recovery codes separately from the device and separately from the password manager itself. A paper copy in a fireproof safe, or a laminated card in a safety deposit box, are both valid options.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Vaultwarden WebSocket not working | Ensure the `/notifications/hub` path is proxied to port `3012` in Caddy |
| Authelia redirect loop | Verify `session.domain` in Authelia config matches the root domain of your services |
| Authentik worker not starting | Check that `AUTHENTIK_SECRET_KEY` is set and consistent across `server` and `worker` services |
| Keycloak `HTTPS required` error | Either enable HTTPS or use `start-dev` mode for local testing only |
| Zitadel masterkey error | `ZITADEL_MASTERKEY` must be exactly 32 characters; generate with `openssl rand -base64 24 \| tr -d '='` |
| CrowdSec not blocking IPs | Confirm the firewall bouncer is installed and running on the host; check `cscli bouncers list` |
| Step-CA cert not trusted by browser | Export and trust the root CA: `step ca root > root.crt && sudo trust anchor root.crt && sudo update-ca-trust` |
| Vaultwarden admin panel 404 | The admin panel is at `/admin` — ensure `ADMIN_TOKEN` is set in the environment |
| Passbolt blank after first load | Ensure `APP_FULL_BASE_URL` includes `https://` and matches your Caddy domain exactly |
| Teleport node not joining | Verify the join token matches exactly and hasn't expired; check port `3025/tcp` is reachable from the node |
| Teleport SSH connection refused | Ensure the Teleport agent is running on the target node (`systemctl status teleport`); check `tsh ls` shows the node as online |
| Passbolt GPG key error | The `/etc/passbolt/gpg` volume must be writable; Passbolt generates its server key on first boot |
| OpenBao sealed after restart | OpenBao must be manually unsealed after every restart; automate with a startup script using stored unseal keys in a secure location |
| OpenBao `permission denied` | Each path requires an explicit policy; run `bao policy write myapp-policy policy.hcl` to grant access |
| Wazuh agent not connecting | Verify port `1514/udp` and `1515/tcp` are open; check `WAZUH_MANAGER` env var points at the correct host |
| Wazuh dashboard blank | Feed sync takes 15–30 min after first boot; check `podman logs wazuh.manager` for sync progress |
| Greenbone scan shows no results | Wait for VT feed sync to complete (check `podman logs gvmd`); ensure the scan target IP is reachable |
| Greenbone `ospd not running` | The `ospd-openvas` container needs `NET_ADMIN` and `NET_RAW` capabilities; verify they are in the compose file |
| Fail2ban not banning IPs | Confirm `cap-add NET_ADMIN` and `NET_RAW` are set; verify the log path inside the container matches the volume mount; test the filter with `fail2ban-regex` |
| Fail2ban banning legitimate users | Whitelist trusted IPs in `jail.d/` with `ignoreip = 127.0.0.1/8 192.168.1.0/24 100.64.0.0/10` (last range covers Tailscale) |
| Trivy CVE database stale | The database auto-updates on each scan run; for the server mode, restart the container to force a refresh or set `--cache-ttl 1h` |
| Trivy scan very slow on first run | The first run downloads the full vulnerability database (~200 MB); subsequent runs use the cache mounted at `/root/.cache/trivy` |
| Coraza WAF blocking legitimate requests | Switch to `SecRuleEngine DetectionOnly`, review the audit log at `/var/log/caddy/coraza-audit.log`, suppress false positives with `SecRuleRemoveById`, then re-enable blocking |
| Coraza Caddy build fails | Ensure the host has Go and `xcaddy` in the builder stage; verify the Coraza plugin version is compatible with the Caddy version |
| SafeLine detector not starting | Check `podman logs safeline-detector` for shared memory errors; add `--shm-size 256m` to the container if needed; verify the `/resources` volume is writable |
| Suricata not detecting traffic | Verify `--network host` is set and the correct interface name is used (`ip link show`); confirm `af-packet` interface in `suricata.yaml` matches |
| Suricata rules not updating | Check internet access from the container; run `suricata-update list-sources` to confirm the source is registered; verify `/var/lib/suricata/rules` is writable |
| osquery not starting | Confirm `osqueryd` is enabled (`systemctl status osqueryd`); check `/var/log/osquery/osqueryd.ERROR` for config parse errors |
| osquery queries return no rows | Some tables require root or specific capabilities; run `sudo osqueryi` to test interactively |
| ZAP scan returns no findings | Ensure the target is reachable from within the container; for internal services use `--network host`; verify the API key matches |
| Nuclei templates out of date | Add `-update-templates` flag to the scan command, or run `nuclei -update-templates` explicitly before scanning |
| SOPS `age: no identity found` | Ensure `SOPS_AGE_KEY_FILE` points to your Age private key file, or set `SOPS_AGE_KEY` env var with the key contents |
| SOPS decrypt fails with `mac check failed` | The encrypted file was modified outside SOPS (e.g. a Git merge conflict marker was introduced); restore the original encrypted file from Git history |

> 🔒 **Security checklist:**
> - Disable Vaultwarden signups after creating your account
> - Rotate the Vaultwarden `ADMIN_TOKEN` after initial setup
> - Back up `/home/user/vaultwarden/data` daily — losing your password vault is catastrophic
> - Use Authelia or Authentik in front of any service exposed via Cloudflare Tunnel or Pangolin
> - Keep Fail2ban active and configured to watch Caddy logs
> - Review CrowdSec decisions weekly to catch false positives before they affect real users
> - Run a Nuclei sweep weekly across all exposed subdomains; schedule it via a systemd timer
> - Run a ZAP baseline scan before making any service publicly accessible
> - Start Suricata in IDS (detection-only) mode before switching to IPS (blocking) mode
> - Run `osquery` on every server and feed results to Wazuh or Loki for centralised host visibility

---

## Caido (Web Security Testing Proxy)

**Purpose:** Modern alternative to Burp Suite Community — HTTP/HTTPS interception proxy with a clean UI, replay, fuzzing, and workflow automation. Written in Rust, significantly faster than Burp for large responses. Free tier is generous for personal/homelab security audits. Use alongside OWASP ZAP (automated scanning) for manual request inspection and testing.

```bash
# Install Caido via the official installer
curl -fsSL https://caido.io/install.sh | bash

# Or download the AppImage and run directly
# https://caido.io/download

# Start Caido (defaults to http://localhost:8080 as proxy, http://localhost:7777 as UI)
caido
```

---

## Rekor (Software Transparency Log)

**Purpose:** Sigstore's tamper-evident transparency log for software supply chain artefacts. Every cosign signature, SLSA provenance attestation, and SBOM attachment can be published to Rekor, creating an immutable, auditable record of what was signed and when. Clients verify that a signature appears in the log before trusting it — even if the signing key is compromised later, the time-stamp in Rekor proves when the signature was made.

```yaml
# ~/rekor/compose.yaml
services:
  rekor-server:
    image: gcr.io/projectsigstore/rekor-server:latest
    ports:
      - 127.0.0.1:3000:3000
    environment:
      REKOR_TRILLIAN_LOG_SERVER_ADDRESS: trillian-log-server:8090
      REKOR_ENABLE_RETRIEVE_API: "true"
    depends_on: [trillian-log-server, trillian-log-signer, mysql]
    restart: unless-stopped

  trillian-log-server:
    image: gcr.io/projectsigstore/trillian_log_server:latest
    environment:
      MYSQL_ADDR: mysql:3306
      MYSQL_DB: trillian
      MYSQL_USER: trillian
      MYSQL_PASSWORD: changeme
    depends_on: [mysql]
    restart: unless-stopped

  trillian-log-signer:
    image: gcr.io/projectsigstore/trillian_log_signer:latest
    environment:
      MYSQL_ADDR: mysql:3306
      MYSQL_DB: trillian
      MYSQL_USER: trillian
      MYSQL_PASSWORD: changeme
    depends_on: [mysql]
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootchangeme
      MYSQL_DATABASE: trillian
      MYSQL_USER: trillian
      MYSQL_PASSWORD: changeme
    volumes: [mysql_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  mysql_data:
```

```bash
cd ~/rekor && podman-compose up -d

# Sign an image and upload provenance to your local Rekor
cosign sign --key cosign.key \
  --rekor-url http://rekor.home.local:3000 \
  registry.home.local/myapp:v1.2.3

# Verify against your local Rekor
cosign verify --key cosign.pub \
  --rekor-url http://rekor.home.local:3000 \
  registry.home.local/myapp:v1.2.3
```

**Caddy:**
```caddyfile
rekor.home.local { tls internal; reverse_proxy localhost:3000 }
```

---

## Security Hardening Checklist

A practical checklist for any new self-hosted service before exposing it:

**Network layer:**
- [ ] Caddy is the only listener on 80/443; service binds to `127.0.0.1` only
- [ ] `firewalld` drops all inbound except 22, 80, 443 (and any intentional ports)
- [ ] CrowdSec bouncer is active and watching Caddy logs
- [ ] Fail2ban is watching Caddy/Authelia for brute-force

**Authentication:**
- [ ] Default credentials changed (check docs for defaults)
- [ ] Admin registration disabled after first account created
- [ ] MFA configured for any admin accounts
- [ ] Authelia or Authentik placed in front if the app has weak auth

**Secrets:**
- [ ] No secrets in environment variables that get printed to logs
- [ ] Compose files with secrets stored in SOPS-encrypted Git
- [ ] Long-lived API tokens rotated; short-lived tokens used where possible

**Container security:**
- [ ] Container runs as non-root (check with `podman inspect --format '{{.Config.User}}'`)
- [ ] No `privileged: true` unless absolutely necessary
- [ ] Volumes mounted `:Z` for SELinux labelling
- [ ] No `host.docker.sock` mounted unless the service explicitly needs container access

**Monitoring:**
- [ ] Service is in Uptime Kuma or Gatus for uptime monitoring
- [ ] Logs forwarded to Loki or Graylog
- [ ] Prometheus scraping if service exposes `/metrics`
- [ ] Alertmanager rule for `service_down`

**Backup:**
- [ ] Data volume path identified and added to Restic backup config
- [ ] Backup tested (restore smoke test)

---

## Gitleaks Pre-commit Configuration

Full team configuration for preventing secret leaks across all common secret types:

```toml
# .gitleaks.toml — place in repo root
title = "Gitleaks Config"

[[rules]]
id = "generic-api-key"
description = "Generic API Key"
regex = '''(?i)(api[_-]?key|apikey|api[_-]?secret)['":\s=]+['"]{0,1}([a-zA-Z0-9_\-]{20,})'''
secretGroup = 2
[rules.allowlist]
  regexes = ['''EXAMPLE''', '''changeme''', '''placeholder''']

[[rules]]
id = "aws-access-key-id"
description = "AWS Access Key ID"
regex = '''(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}'''

[[rules]]
id = "private-key"
description = "Private key"
regex = '''-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY'''

[allowlist]
  paths = [
    '''.gitleaks.toml''',
    '''vendor/''',
    '''node_modules/''',
    '''*.lock''',
  ]
  commits = [
    # Add SHAs of commits with known false positives that have already been rotated
  ]
```

```bash
# Run gitleaks on entire git history
gitleaks detect --source . --log-opts="--all"

# Run on staged files only (fast pre-commit check)
gitleaks protect --staged
```

---

## Security Incident Response Playbook

A lightweight IR playbook for a self-hosted homelab:

### Detection
1. Grafana OnCall / ntfy alert fires (Falco rule, Suricata signature, CrowdSec ban, Wazuh alert)
2. Review the alert — is this a true positive?
3. Escalate immediately if: shell spawned in container, unexpected outbound connection to external IP, rootkit indicators, mass file encryption (ransomware)

### Containment
```bash
# Isolate a suspicious container
podman stop <container-name>

# Block a suspicious IP immediately
sudo firewall-cmd --add-rich-rule='rule family=ipv4 source address=1.2.3.4 reject'

# Revoke a compromised API token (example: Gitea)
curl -X DELETE https://git.home.local/api/v1/user/keys/<key-id> \
  -H "Authorization: token YOUR_ADMIN_TOKEN"

# Check what processes are making outbound connections
ss -tnp | grep ESTABLISHED
osqueryi "SELECT pid, name, remote_address, remote_port FROM process_open_sockets WHERE remote_address NOT IN ('0.0.0.0', '::');"
```

### Evidence Collection
```bash
# Capture container filesystem snapshot before stopping
podman export <container> > container-snapshot-$(date +%Y%m%d-%H%M).tar

# Save relevant logs
journalctl --since "2 hours ago" > /tmp/system-logs-$(date +%Y%m%d).txt
podman logs <container> > /tmp/container-logs-$(date +%Y%m%d).txt

# List all active connections at time of incident
ss -tnp > /tmp/connections-$(date +%Y%m%d-%H%M).txt

# List all running processes
ps auxf > /tmp/processes-$(date +%Y%m%d-%H%M).txt
```

### Recovery
1. Rotate all secrets the compromised service had access to
2. Re-provision from a clean backup (verify backup predates compromise)
3. Patch the exploited vulnerability before bringing service back online
4. Write a blameless postmortem (template in productivity.md)

---

## Caddy (additional routes)

```caddyfile
rekor.home.local { tls internal; reverse_proxy localhost:3000 }
```

---

## Troubleshooting (additional)

| Issue | Solution |
|-------|----------|
| cosign sign fails `unauthorized` | Run `podman login registry.home.local` before signing; cosign uses the same credential store as the container runtime |
| Rekor lookup fails for recent signatures | Rekor has eventual consistency — wait 30s after signing before verifying; check `podman logs rekor-server` for Trillian connection errors |
| Caido proxy not intercepting HTTPS | Install the Caido CA certificate in your browser and OS trust store; the CA cert is downloadable from the Caido UI |
| SOPS `mac check failed` after Git merge | Merge conflicts break the encrypted SOPS MAC — restore the file from Git (`git checkout HEAD -- secrets.yaml`) and re-apply your changes via `sops edit` |
| Gitleaks false positive in CI | Add the SHA to the `allowlist.commits` array in `.gitleaks.toml`; or use an inline `gitleaks:allow` comment on the specific line |

