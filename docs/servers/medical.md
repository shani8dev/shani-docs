---
title: Medical & Health
section: Self-Hosting & Servers
updated: 2026-04-22
---

# Medical & Health

Self-hosted electronic health records, hospital information systems, FHIR servers, health data aggregation, telemedicine, and personal wellness tracking. Keep sensitive medical data on hardware you own and control.

> ⚠️ **Compliance note:** If you are deploying these systems for clinical use in a regulated environment, ensure you understand your local requirements — HIPAA (US), GDPR (EU), or equivalent. Self-hosting does not automatically satisfy compliance obligations; it gives you the control needed to meet them. For personal health tracking, no such obligations apply.

> 🔒 **Security requirement:** All services in this section must be accessed over HTTPS. Use Caddy with `tls internal` for private access or Let's Encrypt for any externally accessible service. Never expose health data over plain HTTP.

---

## Key Concepts

#### HL7 FHIR — the healthcare interoperability standard
FHIR (Fast Healthcare Interoperability Resources) is the HL7 standard for exchanging healthcare data via REST APIs. Resources are the core concept: Patient, Observation, Condition, MedicationRequest, DiagnosticReport, Immunization, Appointment, and ~145 others, each with a defined JSON/XML schema. A FHIR server stores and retrieves these resources via standard REST operations (`GET /Patient/123`, `POST /Observation`). SMART on FHIR adds OAuth2 authentication for patient-facing apps — an app requests scopes (`patient/Observation.read`) and receives a token authorising access to specific resources for a specific patient. This is the architecture behind Apple Health's medical records import and any patient-portal integration in the US (required by the 21st Century Cures Act).

#### HIPAA, GDPR, and the compliance landscape
HIPAA (US) protects Protected Health Information (PHI) — any information that could identify a patient linked to their health condition, care, or payment. The Security Rule requires technical safeguards: access controls, audit logs, encryption at rest and in transit, automatic logoff. The Minimum Necessary standard: systems should request and store only the health data required for the stated purpose. GDPR (EU) treats health data as a "special category" requiring explicit consent and stricter controls. For self-hosted clinical systems, compliance is not automatic — you must implement audit logging, role-based access, encrypted storage, and documented data retention policies. HAPI FHIR and OpenEMR have audit logging built in; enabling and routing those logs is an operational responsibility.

#### Clinical terminologies — SNOMED, LOINC, ICD
Structured clinical data requires standardised codes so systems can exchange and interpret data. SNOMED CT (clinical findings, procedures, body structures — 350,000+ concepts), LOINC (laboratory and clinical observations — `8310-5` = body temperature), ICD-10/11 (diagnoses for billing — `J45.20` = mild intermittent asthma), CPT (procedures for US billing). OpenMRS's concept dictionary maps local terms to standard codes. FHIR resources carry these codes in `coding` arrays with `system` (the terminology URL) and `code` (the value). Any role building health data integrations requires being able to read a FHIR resource's coded fields and look up the terminology.

#### Health data privacy in practice — de-identification
Before using health data for analytics or ML, it must be de-identified. The HIPAA Safe Harbor method removes 18 specific identifiers (name, date of birth, ZIP code, etc.). The Expert Determination method uses statistical analysis to verify re-identification risk below a threshold. K-anonymity ensures each record is indistinguishable from at least K-1 others on quasi-identifiers. Practical implication: even aggregate statistics from a small clinic can re-identify patients — "one patient had condition X this month" in a small town is not de-identified. Tools like ARX perform automated de-identification and k-anonymity analysis. For any role handling health data in research or analytics, understanding the legal and technical distinction between de-identified and pseudonymised data is required.

#### Telemedicine and WebRTC in clinical contexts
Telemedicine video consultations use WebRTC (the same protocol as Jitsi Meet) to deliver sub-second latency, encrypted audio/video directly between patient and provider browsers without a plugin. The clinical requirements add complexity: the session must be end-to-end encrypted (no relay server decrypting video), the session recording (if any) must be stored in the patient record with appropriate access controls, and the session must be accessible from hospital-grade firewalls that often block unusual UDP ports (requiring TURN relay fallback). Jitsi Meet's architecture — Videobridge SFU for media routing, Jicofo for focus management, XMPP signalling — is the reference implementation for HIPAA-eligible video calling.

#### EHR integration patterns — HL7 v2 and FHIR side by side
Many clinical environments run legacy HL7 v2 messaging alongside modern FHIR. HL7 v2 is a pipe-delimited text format used since the 1980s for ADT (admit/discharge/transfer) messages, lab results (ORU), and orders (ORM). A complete integration engine (Mirth Connect, Rhapsody) translates between v2 and FHIR — extracting fields from a v2 ORM message and creating a FHIR ServiceRequest resource. For health IT engineering roles, being able to read a HL7 v2 message (`MSH|^~\&|...`), identify the message type from the MSH segment, and map fields to FHIR resources is a differentiating skill that most candidates lack.

## OpenMRS (Open Medical Records System)

**Purpose:** The most widely deployed open-source electronic medical records system in the world. Used in thousands of clinics across Africa, Asia, and Latin America. Supports patient registration, visit tracking, observations, orders, diagnoses, and a concept dictionary for customising data capture to any clinical workflow. Highly extensible via a module system.

```yaml
# ~/openmrs/compose.yml
services:
  openmrs:
    image: openmrs/openmrs-reference-application-3-backend:latest
    ports: ["127.0.0.1:8080:8080"]
    environment:
      OMRS_CONFIG_MODULE_WEB_ADMIN: "true"
      OMRS_CONFIG_AUTO_UPDATE_DATABASE: "true"
      OMRS_CONFIG_CONNECTION_SERVER: db
      OMRS_CONFIG_CONNECTION_DATABASE: openmrs
      OMRS_CONFIG_CONNECTION_USERNAME: openmrs
      OMRS_CONFIG_CONNECTION_PASSWORD: changeme
      OMRS_CONFIG_CONNECTION_ROOT_PASSWORD: rootchangeme
    volumes:
      - /home/user/openmrs/data:/openmrs/data:Z
    depends_on: [db]
    restart: unless-stopped

  openmrs-frontend:
    image: openmrs/openmrs-reference-application-3-frontend:latest
    ports: ["127.0.0.1:8081:80"]
    environment:
      SPA_PATH: /openmrs/spa
      API_URL: /openmrs
      SPA_CONFIG_URLS: /openmrs/spa/config.json
    depends_on: [openmrs]
    restart: unless-stopped

  db:
    image: mariadb:10.11
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    environment:
      MYSQL_DATABASE: openmrs
      MYSQL_USER: openmrs
      MYSQL_PASSWORD: changeme
      MYSQL_ROOT_PASSWORD: rootchangeme
    volumes: [db_data:/var/lib/mysql]
    restart: unless-stopped

volumes:
  db_data:
```

```bash
cd ~/openmrs && podman-compose up -d
```

Access the backend at `http://localhost:8080/openmrs` and the React SPA frontend at `http://localhost:8081`.

#### Key OpenMRS modules to install
- **EMR API** — core clinical workflows
- **HTML Form Entry** — customisable data capture forms
- **Reporting** — patient cohort reports and aggregate statistics
- **Allergies UI** — allergy tracking
- **Atlas** — anonymised usage reporting for the global community (optional)

#### FHIR resources and the RESTful API model
FHIR structures clinical data as resources: Patient, Observation, Condition, MedicationRequest, DiagnosticReport, Encounter. Each resource is a JSON or XML document with a standard schema. The FHIR REST API maps directly to HTTP: `GET /Patient/{id}` retrieves a patient record; `POST /Observation` creates a new observation; `GET /Observation?subject=Patient/{id}&code=8480-6` searches for a patient's blood pressure readings using LOINC code 8480-6. The `_include` parameter joins related resources in one request (fetch a DiagnosticReport and its referenced Observation in one call). This RESTful model makes FHIR significantly more developer-friendly than HL7 v2 (pipe-delimited messages) or SOAP-based web services.

#### Clinical decision support — CDS Hooks
CDS Hooks is a standard for triggering external clinical decision support services at specific points in a clinical workflow: `patient-view` (clinician opens a patient chart), `order-select` (clinician selects a medication), `order-sign` (clinician signs an order). The EHR sends a JSON hook request to the CDS service; the service responds with cards — informational alerts, suggestions, or links — displayed in the EHR UI. This enables real-time drug interaction alerts, guideline reminders, and predictive risk scores without modifying the EHR itself. OpenMRS and HAPI FHIR support CDS Hooks.

#### De-identification and the Safe Harbor method
HIPAA's Safe Harbor de-identification method requires removing 18 specific identifiers: names, geographic subdivisions smaller than state, dates (other than year) for individuals over 89, phone numbers, fax numbers, email addresses, SSN, medical record numbers, health plan beneficiary numbers, account numbers, certificate/license numbers, VINs, device identifiers, URLs, IP addresses, biometric identifiers, full-face photos, and any other unique identifiers. After removal, the covered entity must have no actual knowledge the information could identify an individual. De-identified data is no longer PHI and can be used for research and analytics without patient consent. Synthetic data generation (Synthea) creates realistic but entirely fictional patient datasets useful for testing.

#### Audit logging requirements in healthcare systems
Every access to patient data must be logged for compliance (HIPAA, GDPR Article 9). Required fields: who accessed the record (user ID + role), which record was accessed (patient ID + resource type), from where (IP address, application), when (timestamp with timezone), and what action (read, write, delete). Logs must be tamper-evident (write to an append-only log store or SIEM like Wazuh), retained for 6 years under HIPAA, and regularly reviewed for anomalous access patterns (a nurse accessing 500 records in 10 minutes). OpenMRS includes an Audit Log module; HAPI FHIR server logs all REST interactions in a standard format.

---

## OpenEMR

**Purpose:** Full-featured open-source EHR/EMR and practice management system for small to medium clinics. Includes patient demographics, scheduling, clinical notes (SOAP), e-prescribing, billing (ICD-10, CPT), lab orders, imaging, and a patient portal. More approachable for Western clinical workflows than OpenMRS.

```yaml
# ~/openemr/compose.yaml
services:
  openemr:
    image: openemr/openemr:7.0.3
    ports:
      - 127.0.0.1:8083:80
      - 127.0.0.1:8084:443
    volumes:
      - /home/user/openemr/sites:/var/www/localhost/htdocs/openemr/sites:Z
      - /home/user/openemr/logs:/var/log:Z
    environment:
      MYSQL_HOST: host.containers.internal
      MYSQL_ROOT_PASS: rootchangeme
      MYSQL_USER: openemr
      MYSQL_PASS: changeme
      OE_USER: admin
      OE_PASS: changeme
    restart: unless-stopped
```

```bash
cd ~/openemr && podman-compose up -d
```

#### Common operations
```bash
# View logs
podman logs -f openemr

# Run OpenEMR CLI commands
podman exec openemr php /var/www/localhost/htdocs/openemr/library/oe_utils.php

# Backup OpenEMR database
podman exec openemr mysqldump -h host.containers.internal -u openemr -pchangeme openemr > openemr-backup.sql

# Check FHIR API is responding
curl http://localhost:8083/apis/default/fhir/metadata | python3 -m json.tool | head -20

# Create an admin via CLI
podman exec openemr php /var/www/localhost/htdocs/openemr/contrib/util/installModules.php
```

Access at `http://localhost:8083`. The setup wizard runs on first visit.

#### OpenEMR features relevant for self-hosted clinics
- FHIR R4 API endpoint at `/apis/default/fhir/` for interoperability
- Telehealth via built-in Jitsi integration (Settings → Telehealth)
- Patient portal for appointment booking and secure messaging
- Two-factor authentication for provider logins
- Audit logging for all record access

---

## HAPI FHIR Server

**Purpose:** Reference implementation of the HL7 FHIR (Fast Healthcare Interoperability Resources) standard. A FHIR server is the interoperability backbone of a modern health data stack — it stores and exposes clinical resources (Patient, Observation, Condition, MedicationRequest, Immunization, DiagnosticReport) in a standardised REST API that any FHIR-compatible app or device can consume.

```yaml
# ~/hapi-fhir/compose.yaml
services:
  hapi-fhir:
    image: hapiproject/hapi:latest
    ports:
      - 127.0.0.1:8082:8080
    volumes:
      - /home/user/hapi-fhir/data:/data:Z
    environment:
      hapi.fhir.default_encoding: json
      hapi.fhir.fhir_version: R4
      spring.datasource.url: jdbc:postgresql://host.containers.internal:5432/hapifhir
      spring.datasource.username: hapifhir
      spring.datasource.password: changeme
      spring.datasource.driverClassName: org.postgresql.Driver
      spring.jpa.properties.hibernate.dialect: ca.uhn.fhir.jpa.model.dialect.HapiFhirPostgres94Dialect
    restart: unless-stopped
```

```bash
cd ~/hapi-fhir && podman-compose up -d
```

> Create the PostgreSQL database first: `CREATE DATABASE hapifhir;`

##### Test the FHIR API

```bash
# Create a Patient resource
curl -X POST http://localhost:8082/fhir/Patient \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Patient","name":[{"family":"Smith","given":["John"]}],"birthDate":"1985-04-15","gender":"male"}'

# Search patients by name
curl "http://localhost:8082/fhir/Patient?family=Smith"

# Get all Observations for a patient
curl "http://localhost:8082/fhir/Observation?subject=Patient/1"

# FHIR capability statement
curl http://localhost:8082/fhir/metadata
```

#### Common operations
```bash
# Test the FHIR capability statement
curl http://localhost:8082/fhir/metadata | python3 -m json.tool | head -30

# Create a Patient resource
curl -X POST http://localhost:8082/fhir/Patient   -H "Content-Type: application/fhir+json"   -d '{"resourceType":"Patient","name":[{"family":"Smith","given":["John"]}],"birthDate":"1985-04-15","gender":"male"}'

# Search patients by name
curl "http://localhost:8082/fhir/Patient?family=Smith"

# Get all Observations for a patient
curl "http://localhost:8082/fhir/Observation?subject=Patient/1"

# Validate a resource
curl -X POST "http://localhost:8082/fhir/Patient/\$validate"   -H "Content-Type: application/fhir+json"   -d '{"resourceType":"Patient","name":[{"family":"Test"}]}'

# Count resources
curl "http://localhost:8082/fhir/Patient?_summary=count"

# View server logs
podman logs -f hapi-fhir
```

> OpenEMR, OpenMRS, and wearable sync tools (Apple Health, Google Fit, Garmin) can all export FHIR resources — centralise them in a self-hosted HAPI FHIR server as your personal health data hub.

---

## Medplum

**Purpose:** Modern FHIR-native healthcare platform. Combines a FHIR R4 server, a bot and automation engine (think healthcare-specific n8n), an admin UI, and a React component library for building custom patient-facing apps. Better developer experience than HAPI for teams building healthcare applications rather than just storing records.

```yaml
# ~/medplum/compose.yml
services:
  medplum-server:
    image: medplum/medplum-server:latest
    ports: ["127.0.0.1:8103:8103"]
    environment:
      DATABASE_URL: postgresql://medplum:changeme@db:5432/medplum
      REDIS_URL: redis://redis:6379
      APP_BASE_URL: https://medplum.home.local
      BASE_URL: https://medplum.home.local/api/
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: medplum
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: medplum
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/medplum && podman-compose up -d
```

---

## Tandoor (Recipe & Nutrition Tracking)

**Purpose:** Self-hosted recipe manager with ingredient-level nutritional data, meal planning, and shopping list generation. Useful for health-focused users who want to log macros and nutrition against specific recipes. See also [Mealie in the Productivity wiki](https://docs.shani.dev/doc/servers/productivity#mealie-recipe-manager) for a lighter-weight recipe manager without the nutrition tracking focus.

```yaml
# ~/tandoor/compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: djangouser
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: djangodb
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  web:
    image: vabene1111/recipes:latest
    ports: ["127.0.0.1:8085:8080"]
    environment:
      SECRET_KEY: changeme-run-openssl-rand-base64-50
      DB_ENGINE: django.db.backends.postgresql
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
      POSTGRES_USER: djangouser
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: djangodb
      ALLOWED_HOSTS: "*"
    volumes:
      - /home/user/tandoor/staticfiles:/opt/recipes/staticfiles:Z
      - /home/user/tandoor/mediafiles:/opt/recipes/mediafiles:Z
    depends_on: [db]
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/tandoor && podman-compose up -d
```

---

## Wger (Workout Manager)

**Purpose:** Self-hosted fitness tracker — workout plans, exercise logging, body weight and measurements over time, REST API for mobile app integration, and a nutrition module with a food database. Useful for athletes who want to keep training logs private and under their own control.

```yaml
# ~/wger/compose.yml
services:
  web:
    image: wger/server:latest
    ports: ["127.0.0.1:8086:80"]
    environment:
      WGER_USE_GUNICORN: "True"
      DJANGO_DB_ENGINE: django.db.backends.postgresql
      DJANGO_DB_DATABASE: wger
      DJANGO_DB_USER: wger
      DJANGO_DB_PASSWORD: changeme
      DJANGO_DB_HOST: db
      DJANGO_DB_PORT: 5432
      SITE_URL: https://wger.home.local
    volumes:
      - /home/user/wger/media:/home/wger/media:Z
      - /home/user/wger/static:/home/wger/static:Z
    depends_on: [db, redis]
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: wger
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: wger
    volumes: [pg_data:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  pg_data:
```

```bash
cd ~/wger && podman-compose up -d
```

#### Mobile apps
wger has iOS and Android apps that sync to a self-hosted server via the REST API.

---

## Fasten Health (Personal Health Record Aggregator)

**Purpose:** Connects to hundreds of US health providers, insurance networks, and labs via SMART on FHIR and downloads your complete health records to your self-hosted server. One dashboard for all your medical history across every provider — visit notes, labs, imaging, prescriptions — stored locally.

```yaml
# ~/fasten-health/compose.yaml
services:
  fasten-health:
    image: ghcr.io/fastenhealth/fasten-onprem:main
    ports:
      - 127.0.0.1:8090:8080
    volumes:
      - /home/user/fasten/db:/opt/fasten/db:Z
      - /home/user/fasten/cache:/opt/fasten/cache:Z
    restart: unless-stopped
```

```bash
cd ~/fasten-health && podman-compose up -d
```

Access at `http://localhost:8090`. Add providers under Sources → Add Source. Fasten uses the standardised SMART on FHIR authorisation flow — your credentials never touch the Fasten server, only your own instance.

> Fasten currently supports 1,000+ US health systems. Non-US users can manually import FHIR bundles exported from compatible EHR systems.

---

## Personal Health Data Stack

A complete personal health data system on Shani OS:

```
Wearables / Devices / Provider Portals
         │
         ▼
   Fasten Health          ← aggregates FHIR records from providers
   Apple Health export    ← via FHIR export + manual import
         │
         ▼
   HAPI FHIR Server       ← central FHIR store (your health data hub)
         │
         ▼
   Metabase / Grafana     ← dashboards over FHIR data via PostgreSQL
         │
         ▼
   Restic → Backblaze B2  ← encrypted offsite backup
```

---

## Caddy Configuration

```caddyfile
openmrs.home.local  { tls internal; reverse_proxy localhost:8080 }
openemr.home.local  { tls internal; reverse_proxy localhost:8083 }
fhir.home.local     { tls internal; reverse_proxy localhost:8082 }
fasten.home.local   { tls internal; reverse_proxy localhost:8090 }
tandoor.home.local  { tls internal; reverse_proxy localhost:8085 }
wger.home.local     { tls internal; reverse_proxy localhost:8086 }
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| OpenMRS setup wizard loops | Ensure MariaDB is fully started before OpenMRS; add `depends_on` with a health check; verify `utf8mb4` charset is set |
| OpenEMR blank after install | Check PHP error log with `podman logs openemr`; ensure the sites volume has correct write permissions |
| HAPI FHIR 500 on startup | PostgreSQL must be running and the `hapifhir` database must exist before starting; HAPI runs Flyway migrations on boot |
| FHIR resource validation errors | Check the resource against the FHIR R4 spec at `http://localhost:8082/fhir/StructureDefinition`; use the `$validate` operation |
| Fasten health provider not found | The provider list is US-focused; for other countries, use the manual FHIR bundle import option |
| Medplum bots not executing | Ensure the bot is deployed and the subscription trigger is correctly configured; check the audit log in the admin panel |
| wger app can't sync | Verify `SITE_URL` matches the URL the mobile app connects to; the REST API is at `/api/v2/` |
| Nextcloud Health app missing data | Ensure the Health app is enabled in Apps; data is per-user and stored in Nextcloud's database |
| Tandoor nutrition data missing | Import the USDA food database after first run: `podman exec web python manage.py import_usda_data` |

> 🔒 **Security checklist for health data:**
> - Use HTTPS for all health services — never plain HTTP
> - Restrict access to Tailscale or Authelia-protected routes only; health data should never be publicly accessible
> - Enable audit logging in OpenMRS and OpenEMR — every record access should be logged
> - Back up health databases daily with Restic to an encrypted offsite destination
> - Rotate database passwords and service credentials on a schedule
