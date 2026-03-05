# Module: container-registry

GCP Artifact Registry (Docker format) with per-application repositories, automatic vulnerability scanning, and configurable image cleanup policies.

## Overview

This module provisions one Artifact Registry Docker repository per application name. Using separate repositories provides:

- **Fine-grained IAM**: each Cloud Run service account can be granted access only to its own repository (enforced in the `iam` module)
- **Independent cleanup policies**: repositories manage their own image lifecycle
- **Clear ownership**: repository name = application name

Cleanup policy retains the last N tagged images and deletes untagged images older than 1 day, controlling storage costs.

## Usage

```hcl
module "container_registry" {
  source = "./modules/container-registry"

  environment           = "dev"
  project_name          = "iexcel"
  gcp_project_id        = "iexcel-dev"
  region                = "us-central1"
  app_names             = ["auth", "api", "mastra", "ui"]
  image_retention_count = 5
}
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `environment` | `string` | yes | — | One of: dev, staging, production |
| `project_name` | `string` | yes | — | Short project name prefix |
| `gcp_project_id` | `string` | yes | — | GCP project ID |
| `region` | `string` | yes | — | GCP region for repository storage |
| `app_names` | `list(string)` | yes | — | Application names (one repo created per name) |
| `image_retention_count` | `number` | no | `10` | Number of recent tagged images to retain (1–100) |

## Outputs

| Name | Description |
|------|-------------|
| `registry_url` | Base Artifact Registry URL ({region}-docker.pkg.dev/{project}/{prefix}) |
| `repository_urls` | Map of app name to full repository pull/push URL |
| `repository_ids` | Map of app name to repository resource ID (for IAM bindings) |

## Image Tagging Convention

CI/CD pipelines should tag images as:

```
{region}-docker.pkg.dev/{project_id}/{project_name}-{environment}-{app_name}:{git_sha}
{region}-docker.pkg.dev/{project_id}/{project_name}-{environment}-{app_name}:latest
```

Example (dev, api service):

```
us-central1-docker.pkg.dev/iexcel-dev/iexcel-dev-api:abc1234
us-central1-docker.pkg.dev/iexcel-dev/iexcel-dev-api:latest
```

## Cleanup Policy Notes

- Tagged images: the `keep-recent-tagged` policy retains the most recent `image_retention_count` images. Older tagged images are automatically deleted.
- Untagged images: the `delete-old-untagged` policy deletes layers and manifests not referenced by any tag after 24 hours, preventing unbounded storage growth from CI/CD builds.
- `cleanup_policy_dry_run = false` means policies are enforced immediately. Set to `true` to audit what would be deleted before enforcing.
