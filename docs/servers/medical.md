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

Access the backend at `http://localhost:8080/openmrs` and the React SPA frontend at `http://localhost:8081`.

**Key OpenMRS modules to install:**
- **EMR API** — core clinical workflows
- **HTML Form Entry** — customisable data capture forms
- **Reporting** — patient cohort reports and aggregate statistics
- **Allergies UI** — allergy tracking
- **Atlas** — anonymised usage reporting for the global community (optional)

---

## OpenEMR

**Purpose:** Full-featured open-source EHR/EMR and practice management system for small to medium clinics. Includes patient demographics, scheduling, clinical notes (SOAP), e-prescribing, billing (ICD-10, CPT), lab orders, imaging, and a patient portal. More approachable for Western clinical workflows than OpenMRS.

```bash
podman run -d \
  --name openemr \
  -p 127.0.0.1:8083:80 \
  -p 127.0.0.1:8084:443 \
  -v /home/user/openemr/sites:/var/www/localhost/htdocs/openemr/sites:Z \
  -v /home/user/openemr/logs:/var/log:Z \
  -e MYSQL_HOST=host.containers.internal \
  -e MYSQL_ROOT_PASS=rootchangeme \
  -e MYSQL_USER=openemr \
  -e MYSQL_PASS=changeme \
  -e OE_USER=admin \
  -e OE_PASS=changeme \
  --restart unless-stopped \
  openemr/openemr:7.0.2
```

Access at `http://localhost:8083`. The setup wizard runs on first visit.

**OpenEMR features relevant for self-hosted clinics:**
- FHIR R4 API endpoint at `/apis/default/fhir/` for interoperability
- Telehealth via built-in Jitsi integration (Settings → Telehealth)
- Patient portal for appointment booking and secure messaging
- Two-factor authentication for provider logins
- Audit logging for all record access

---

## HAPI FHIR Server

**Purpose:** Reference implementation of the HL7 FHIR (Fast Healthcare Interoperability Resources) standard. A FHIR server is the interoperability backbone of a modern health data stack — it stores and exposes clinical resources (Patient, Observation, Condition, MedicationRequest, Immunization, DiagnosticReport) in a standardised REST API that any FHIR-compatible app or device can consume.

```bash
podman run -d \
  --name hapi-fhir \
  -p 127.0.0.1:8082:8080 \
  -v /home/user/hapi-fhir/data:/data:Z \
  -e hapi.fhir.default_encoding=json \
  -e hapi.fhir.fhir_version=R4 \
  -e spring.datasource.url=jdbc:postgresql://host.containers.internal:5432/hapifhir \
  -e spring.datasource.username=hapifhir \
  -e spring.datasource.password=changeme \
  -e spring.datasource.driverClassName=org.postgresql.Driver \
  -e spring.jpa.properties.hibernate.dialect=ca.uhn.fhir.jpa.model.dialect.HapiFhirPostgres94Dialect \
  --restart unless-stopped \
  hapiproject/hapi:latest
```

> Create the PostgreSQL database first: `CREATE DATABASE hapifhir;`

**Test the FHIR API:**
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

---

## Nextcloud Health

For personal health tracking without a full clinical system, Nextcloud's app ecosystem covers the basics:

```bash
podman exec -u www-data nextcloud php occ app:install health
```

The **Health** app tracks weight, blood pressure, temperature, heart rate, and menstrual cycles with charts and CSV export. Data lives entirely in your Nextcloud instance. See the [Productivity wiki](https://docs.shani.dev/doc/servers/productivity#nextcloud) for the Nextcloud setup.

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

**Mobile apps:** wger has iOS and Android apps that sync to a self-hosted server via the REST API.

---

## Fasten Health (Personal Health Record Aggregator)

**Purpose:** Connects to hundreds of US health providers, insurance networks, and labs via SMART on FHIR and downloads your complete health records to your self-hosted server. One dashboard for all your medical history across every provider — visit notes, labs, imaging, prescriptions — stored locally.

```bash
podman run -d \
  --name fasten-health \
  -p 127.0.0.1:8090:8080 \
  -v /home/user/fasten/db:/opt/fasten/db:Z \
  -v /home/user/fasten/cache:/opt/fasten/cache:Z \
  --restart unless-stopped \
  ghcr.io/fastenhealth/fasten-onprem:main
```

Access at `http://localhost:8090`. Add providers under Sources → Add Source. Fasten uses the standardised SMART on FHIR authorisation flow — your credentials never touch the Fasten server, only your own instance.

> Fasten currently supports 1,000+ US health systems. Non-US users can manually import FHIR bundles exported from compatible EHR systems.

---

## Healthchecks.io (Cron Monitoring)

**Purpose:** Dead man's switch for scheduled tasks — backup jobs, data sync pipelines, and automated exports all ping a URL when they finish. If the ping doesn't arrive on schedule, you get alerted. Useful for ensuring your health data pipelines (FHIR imports, nightly backups) run reliably.

See the [Monitoring wiki](https://docs.shani.dev/doc/servers/monitoring#healthchecksio-cron-monitoring) for the full setup.

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
