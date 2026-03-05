# Module: mastra

Deploys the iExcel Mastra AI agent orchestration service on GCP Cloud Run v2.

## Responsibilities

- Provisions a `google_cloud_run_v2_service` running the mastra container image
- Restricts ingress to internal traffic only (`INGRESS_TRAFFIC_INTERNAL_ONLY`)
- Injects Secret Manager secrets as environment variables at runtime
- Grants the API service account `roles/run.invoker` for internal API-to-mastra calls
- Does NOT create a Serverless NEG — mastra is never exposed via the load balancer

## Ports

| Port | Protocol | Purpose            |
|------|----------|--------------------|
| 8081 | HTTP     | Mastra agent API   |

## Secrets Injected

| Env Var              | Secret Key           |
|----------------------|----------------------|
| LLM_API_KEY          | LLM_API_KEY          |
| MASTRA_CLIENT_SECRET | MASTRA_CLIENT_SECRET |

## Plain Environment Variables

| Env Var          | Source                               |
|------------------|--------------------------------------|
| API_BASE_URL     | `module.api.service_url`             |
| AUTH_ISSUER_URL  | `"https://auth.{domain}"`            |
| MASTRA_CLIENT_ID | `var.mastra_client_id`               |
| LLM_PROVIDER     | `var.llm_provider`                   |
| LLM_MODEL        | `var.llm_model`                      |
| MASTRA_PORT      | `"8081"`                             |
| MASTRA_HOST      | `"0.0.0.0"`                          |

## Inputs

| Name                       | Type        | Required | Description                                      |
|----------------------------|-------------|----------|--------------------------------------------------|
| environment                | string      | yes      | Deployment environment                           |
| project_name               | string      | yes      | Short project name prefix                        |
| gcp_project_id             | string      | yes      | GCP project ID                                   |
| region                     | string      | yes      | GCP region                                       |
| image_url                  | string      | yes      | Artifact Registry image URL with tag             |
| service_account            | string      | yes      | Service account email from IAM module            |
| vpc_connector_id           | string      | yes      | VPC connector ID from networking module          |
| secret_names               | map(string) | yes      | Secret name map from secrets module              |
| api_base_url               | string      | yes      | API service URL from module.api.service_url      |
| domain                     | string      | yes      | Base domain for AUTH_ISSUER_URL construction     |
| api_service_account_email  | string      | yes      | API SA email granted invoker on this service     |
| mastra_client_id           | string      | no       | Client ID for auth (default: mastra-agent)       |
| llm_provider               | string      | no       | LLM provider (default: anthropic)                |
| llm_model                  | string      | no       | LLM model name (default: claude-sonnet-4-20250514)|
| min_instances              | number      | no       | Min Cloud Run instances (default: 0)             |
| max_instances              | number      | no       | Max Cloud Run instances (default: 3)             |

## Outputs

| Name         | Description                                                    |
|--------------|----------------------------------------------------------------|
| service_url  | Internal Cloud Run URL (set as mastra_url in api module)       |
| service_name | Cloud Run service name                                         |

## Security

Mastra is strictly internal:
- `INGRESS_TRAFFIC_INTERNAL_ONLY` blocks all external traffic
- Only the API service account can invoke mastra via IAM binding
- No `allUsers` binding — access is always authenticated

## Resource Sizing

Mastra is allocated 2 vCPU and 2Gi RAM because LLM response streaming and agent state
management require sustained CPU and large memory for context windows.
`cpu_idle = false` prevents CPU throttling during LLM streaming.

## Dependencies

This module must be applied after the `api` module because:
1. `api_base_url` requires `module.api.service_url` to be known
2. `api_service_account_email` requires the API SA to exist in IAM
