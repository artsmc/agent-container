# Module: api

Deploys the iExcel Fastify API backend on GCP Cloud Run v2.

## Responsibilities

- Provisions a `google_cloud_run_v2_service` running the API container image
- Restricts ingress to load balancer traffic (`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`)
- Injects Secret Manager secrets as environment variables at runtime
- Creates a Serverless NEG for attachment to the DNS module backend service stub
- Grants `allUsers` the `roles/run.invoker` role (JWT validation handles auth at app layer)

## Ports

| Port | Protocol | Purpose  |
|------|----------|----------|
| 8080 | HTTP     | REST API |

## Secrets Injected

| Env Var                    | Secret Key                  |
|----------------------------|-----------------------------|
| DATABASE_URL               | DATABASE_URL                |
| ASANA_CLIENT_ID            | ASANA_CLIENT_ID             |
| ASANA_CLIENT_SECRET        | ASANA_CLIENT_SECRET         |
| ASANA_ACCESS_TOKEN         | ASANA_ACCESS_TOKEN          |
| GRAIN_API_KEY              | GRAIN_API_KEY               |
| GOOGLE_SERVICE_ACCOUNT_JSON | GOOGLE_SERVICE_ACCOUNT_JSON |
| EMAIL_PROVIDER_API_KEY     | EMAIL_PROVIDER_API_KEY      |
| LLM_API_KEY                | LLM_API_KEY                 |

## Plain Environment Variables

| Env Var         | Source                                  |
|-----------------|-----------------------------------------|
| AUTH_ISSUER_URL | `"https://auth.{domain}"`               |
| AUTH_AUDIENCE   | `var.auth_audience` (default: iexcel-api)|
| MASTRA_URL      | `var.mastra_url` (set post-deployment)  |
| PORT            | `"8080"`                                |

## Inputs

| Name            | Type        | Required | Description                                           |
|-----------------|-------------|----------|-------------------------------------------------------|
| environment     | string      | yes      | Deployment environment                                |
| project_name    | string      | yes      | Short project name prefix                             |
| gcp_project_id  | string      | yes      | GCP project ID                                        |
| region          | string      | yes      | GCP region                                            |
| image_url       | string      | yes      | Artifact Registry image URL with tag                  |
| service_account | string      | yes      | Service account email from IAM module                 |
| vpc_connector_id| string      | yes      | VPC connector ID from networking module               |
| secret_names    | map(string) | yes      | Secret name map from secrets module                   |
| domain          | string      | yes      | Base domain for AUTH_ISSUER_URL construction          |
| auth_audience   | string      | no       | JWT audience value (default: iexcel-api)              |
| mastra_url      | string      | no       | Mastra service URL (empty until mastra is deployed)   |
| min_instances   | number      | no       | Min Cloud Run instances (default: 0)                  |
| max_instances   | number      | no       | Max Cloud Run instances (default: 5)                  |

## Outputs

| Name          | Description                                         |
|---------------|-----------------------------------------------------|
| service_url   | Cloud Run service URI (passed to mastra as api_base_url) |
| service_name  | Cloud Run service name                              |
| neg_self_link | Serverless NEG self-link for DNS module attachment  |
| neg_id        | Serverless NEG resource ID                          |

## MASTRA_URL Bootstrap Note

On the first `terraform apply`, `mastra_url` is an empty string because the mastra
service does not exist yet. After apply, retrieve the mastra service URL from
Terraform outputs (`terraform output mastra_service_url`), set `mastra_url` in the
appropriate `.tfvars` file, and re-apply to update the API service with the correct URL.
