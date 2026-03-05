# Module: ui

Deploys the iExcel Next.js frontend on GCP Cloud Run v2.

## Responsibilities

- Provisions a `google_cloud_run_v2_service` running the UI container image
- Restricts ingress to load balancer traffic (`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`)
- Injects public API and auth URLs as environment variables
- Creates a Serverless NEG for attachment to the DNS module backend service stub
- Grants `allUsers` the `roles/run.invoker` role
- Cloud CDN is enabled on the backend service (in the DNS module) for static asset caching

## Ports

| Port | Protocol | Purpose        |
|------|----------|----------------|
| 3000 | HTTP     | Next.js server |

## Secrets Injected

None. The UI accesses all data through the public API service. There are no
server-side secrets in the UI container.

## Plain Environment Variables

| Env Var               | Source                          |
|-----------------------|---------------------------------|
| NEXT_PUBLIC_API_URL   | `"https://api.{domain}"`        |
| NEXT_PUBLIC_AUTH_URL  | `"https://auth.{domain}"`       |
| PORT                  | `"3000"`                        |

## Inputs

| Name             | Type   | Required | Description                                      |
|------------------|--------|----------|--------------------------------------------------|
| environment      | string | yes      | Deployment environment                           |
| project_name     | string | yes      | Short project name prefix                        |
| gcp_project_id   | string | yes      | GCP project ID                                   |
| region           | string | yes      | GCP region                                       |
| image_url        | string | yes      | Artifact Registry image URL with tag             |
| service_account  | string | yes      | Service account email from IAM module            |
| vpc_connector_id | string | yes      | VPC connector ID from networking module          |
| domain           | string | yes      | Base domain for public URL construction          |
| min_instances    | number | no       | Min Cloud Run instances (default: 0)             |
| max_instances    | number | no       | Max Cloud Run instances (default: 3)             |

## Outputs

| Name          | Description                                         |
|---------------|-----------------------------------------------------|
| service_url   | Cloud Run service URI                               |
| service_name  | Cloud Run service name                              |
| neg_self_link | Serverless NEG self-link for DNS module attachment  |
| neg_id        | Serverless NEG resource ID                          |

## Cloud CDN

Cloud CDN is enabled on the backend service in the DNS module (`enable_cdn = true`
on the UI backend service). CDN caches static assets (JS, CSS, images) at Google's
edge POPs globally. Cache-Control headers from Next.js control what is cached.

For best CDN performance, configure Next.js to set long-lived `Cache-Control` headers
on static assets (`/_next/static/**`) and short or no caching on SSR pages.
