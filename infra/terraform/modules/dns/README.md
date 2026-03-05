# Module: dns

GCP Global External Load Balancer with Google-managed SSL certificate, host-based URL routing, HTTP-to-HTTPS redirect, and Cloud DNS managed zone.

## Overview

This module provisions the complete public-facing ingress layer:

1. **Global external IP** — anycast address serving all subdomains
2. **Wildcard SSL certificate** — Google-managed cert for `*.{domain}` (auto-renewed)
3. **Global HTTPS load balancer** — host-based routing to three backend services
4. **HTTP redirect** — all port-80 traffic is permanently redirected to HTTPS
5. **Backend service stubs** — placeholders for UI, API, and auth backends (no Cloud Run NEGs attached yet)
6. **Cloud DNS managed zone** — public zone with A records for each subdomain
7. **SSL policy** — enforces TLS 1.2+ with MODERN cipher profile

Backend services are provisioned without backends. Feature 36 (Cloud Run deployment) attaches Serverless NEGs to each backend service after Cloud Run services are deployed.

## Routing Table

| Host | Backend Service |
|---|---|
| `app.{domain}` | ui-backend |
| `api.{domain}` | api-backend |
| `auth.{domain}` | auth-backend |
| `{domain}` | ui-backend (default) |

## Usage

```hcl
module "dns" {
  source = "./modules/dns"

  environment    = "dev"
  project_name   = "iexcel"
  gcp_project_id = "iexcel-dev"
  domain         = "dev.iexcel.app"
  region         = "us-central1"
  vpc_id         = module.networking.vpc_id
}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `environment` | `string` | yes | — | One of: dev, staging, production |
| `project_name` | `string` | yes | — | Short project name prefix |
| `gcp_project_id` | `string` | yes | — | GCP project ID |
| `domain` | `string` | yes | — | Base domain (e.g. dev.iexcel.app) |
| `region` | `string` | yes | — | GCP region (for labeling) |
| `vpc_id` | `string` | yes | — | VPC self_link (reserved for private DNS) |

## Outputs

| Name | Description |
|------|-------------|
| `load_balancer_dns` | Global external IP address string |
| `load_balancer_id` | HTTPS forwarding rule resource ID |
| `ui_backend_service_id` | UI backend service ID (for feature 36 NEG attachment) |
| `api_backend_service_id` | API backend service ID |
| `auth_backend_service_id` | Auth backend service ID |
| `dns_zone_name` | Cloud DNS managed zone name |
| `dns_name_servers` | Authoritative NS records for the zone |
| `ssl_certificate_id` | Google-managed SSL certificate resource ID |

## Post-Provisioning Steps

### 1. Delegate DNS to GCP

After `terraform apply`, get the name servers:

```bash
terraform output -json dns_name_servers
```

Update your domain registrar's NS records to use these GCP name servers.

### 2. Wait for SSL Certificate Activation

SSL certificate provisioning can take 10–60 minutes. Monitor status:

```bash
gcloud compute ssl-certificates describe {name_prefix}-wildcard-cert \
  --global \
  --format="value(managed.status,managed.domainStatus)"
```

The certificate becomes ACTIVE once Google can verify domain ownership via DNS.

### 3. Attach Cloud Run Backends (Feature 36)

Until backends are attached, the load balancer returns HTTP 503. Feature 36 will attach Serverless NEGs to each backend service ID output from this module.

## SSL Policy

The `MODERN` SSL policy enforces:
- Minimum TLS version: 1.2
- Cipher suites: curated modern set (excludes RC4, 3DES, and other deprecated ciphers)

This satisfies common compliance requirements (SOC 2, PCI-DSS 4.0 TLS requirements).

## DNSSEC

DNSSEC is enabled on the managed zone. If your domain registrar supports DS records, add the DS record from the zone to your registrar to complete the DNSSEC chain of trust.
