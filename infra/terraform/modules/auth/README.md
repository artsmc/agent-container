# Module: auth

Deploys the iExcel authentication service on GCP Cloud Run v2.

## Responsibilities

- Provisions a `google_cloud_run_v2_service` running the auth container image
- Restricts ingress to load balancer traffic (`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`)
- Injects Secret Manager secrets as environment variables at runtime
- Creates a Serverless NEG for attachment to the DNS module backend service stub
- Grants `allUsers` the `roles/run.invoker` role (application-layer auth handles security)

## Ports

| Port | Protocol | Purpose           |
|------|----------|-------------------|
| 8090 | HTTP     | Auth service API  |

## Secrets Injected

| Env Var             | Secret Key          |
|---------------------|---------------------|
| AUTH_DATABASE_URL   | AUTH_DATABASE_URL   |
| IDP_CLIENT_ID       | IDP_CLIENT_ID       |
| IDP_CLIENT_SECRET   | IDP_CLIENT_SECRET   |
| SIGNING_KEY_PRIVATE | SIGNING_KEY_PRIVATE |
| SIGNING_KEY_PUBLIC  | SIGNING_KEY_PUBLIC  |

## Plain Environment Variables

| Env Var         | Source                              |
|-----------------|-------------------------------------|
| AUTH_ISSUER_URL | `"https://auth.{domain}"`           |
| PORT            | `"8090"`                            |

## Inputs

| Name              | Type         | Required | Description                                      |
|-------------------|--------------|----------|--------------------------------------------------|
| environment       | string       | yes      | Deployment environment                           |
| project_name      | string       | yes      | Short project name prefix                        |
| gcp_project_id    | string       | yes      | GCP project ID                                   |
| region            | string       | yes      | GCP region                                       |
| image_url         | string       | yes      | Artifact Registry image URL with tag             |
| service_account   | string       | yes      | Service account email from IAM module            |
| vpc_connector_id  | string       | yes      | VPC connector ID from networking module          |
| secret_names      | map(string)  | yes      | Secret name map from secrets module              |
| domain            | string       | yes      | Base domain for AUTH_ISSUER_URL construction     |
| min_instances     | number       | no       | Min Cloud Run instances (default: 0)             |
| max_instances     | number       | no       | Max Cloud Run instances (default: 3)             |

## Outputs

| Name          | Description                                          |
|---------------|------------------------------------------------------|
| service_url   | Cloud Run service URI                                |
| service_name  | Cloud Run service name                               |
| neg_self_link | Serverless NEG self-link for DNS module attachment   |
| neg_id        | Serverless NEG resource ID                           |

## Usage

```hcl
module "auth" {
  source = "./modules/auth"

  environment      = var.environment
  project_name     = var.project_name
  gcp_project_id   = var.gcp_project_id
  region           = var.region
  image_url        = var.auth_image_url
  service_account  = module.iam.auth_service_account
  vpc_connector_id = module.networking.vpc_connector_id
  secret_names     = module.secrets.secret_names
  domain           = var.domain
  min_instances    = var.auth_min_instances
  max_instances    = var.auth_max_instances
}
```

## NEG Attachment

After this module is applied, pass `module.auth.neg_self_link` to the DNS module
as `neg_ids.auth`. The DNS module will attach the NEG to the auth backend service stub,
completing the load balancer routing path.
