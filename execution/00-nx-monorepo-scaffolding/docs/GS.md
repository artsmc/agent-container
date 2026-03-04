# Gherkin Specification
## Feature 00: Nx Monorepo Scaffolding

**Version:** 1.0
**Date:** 2026-03-03

---

```gherkin
Feature: Nx Monorepo Scaffolding
  As a developer working on the iExcel automation system
  I want the Nx monorepo workspace to be fully scaffolded
  So that all 14 downstream features can begin development immediately
  without needing to create the directory structure or root configuration files themselves

  Background:
    Given the repository root is at "/"
    And no application source code has been committed
    And the Nx CLI is installed via devDependencies in package.json

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 1: Root Configuration Files
  # ─────────────────────────────────────────────────────────────

  Scenario: nx.json exists and is valid
    Given the developer is at the repository root
    When they inspect the directory listing
    Then "nx.json" must be present
    And "nx.json" must be valid JSON
    And "nx.json" must contain a "defaultBase" set to "main"
    And "nx.json" must contain "targetDefaults.build.dependsOn" set to ["^build"]
    And "nx.json" must contain "targetDefaults.build.cache" set to true

  Scenario: tsconfig.base.json exists with strict TypeScript settings
    Given the developer is at the repository root
    When they inspect the directory listing
    Then "tsconfig.base.json" must be present
    And "tsconfig.base.json" must be valid JSON
    And "compilerOptions.strict" must be true
    And "compilerOptions.moduleResolution" must be "bundler"
    And "compilerOptions.target" must be "ES2022"

  Scenario: tsconfig.base.json contains all workspace path aliases
    Given "tsconfig.base.json" exists at the repository root
    When a TypeScript file imports from "@iexcel/shared-types"
    Then the TypeScript compiler resolves the alias to "packages/shared-types/src/index.ts"

    When a TypeScript file imports from "@iexcel/api-client"
    Then the TypeScript compiler resolves the alias to "packages/api-client/src/index.ts"

    When a TypeScript file imports from "@iexcel/auth-client"
    Then the TypeScript compiler resolves the alias to "packages/auth-client/src/index.ts"

    When a TypeScript file imports from "@iexcel/database"
    Then the TypeScript compiler resolves the alias to "packages/database/src/index.ts"

    When a TypeScript file imports from "@iexcel/auth-database"
    Then the TypeScript compiler resolves the alias to "packages/auth-database/src/index.ts"

  Scenario: Root package.json is private and defines workspaces
    Given the developer is at the repository root
    When they read "package.json"
    Then "private" must be true
    And "workspaces" must include "apps/*"
    And "workspaces" must include "packages/*"
    And "scripts.graph" must exist and be executable via "npm run graph"

  Scenario: Running npm install succeeds
    Given "package.json" exists at the repository root
    And all devDependencies are declared
    When the developer runs "npm install"
    Then the command exits with code 0
    And "node_modules/" is created at the repository root
    And "nx --version" returns the pinned Nx major version

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 2: Application Project Structure
  # ─────────────────────────────────────────────────────────────

  Scenario Outline: Each application has the required directory structure
    Given the repository root contains an "apps/" directory
    When the developer inspects "apps/<app>/"
    Then "apps/<app>/src/" must exist
    And "apps/<app>/Dockerfile" must exist
    And "apps/<app>/project.json" must exist
    And "apps/<app>/project.json" must contain "name" equal to "<app>"
    And "apps/<app>/project.json" must contain "projectType" equal to "application"
    And "apps/<app>/project.json" must contain "root" equal to "apps/<app>"
    And "apps/<app>/project.json" must contain "tags" including "type:app"

    Examples:
      | app    |
      | auth   |
      | api    |
      | mastra |
      | ui     |

  Scenario Outline: Application Dockerfiles are placeholders only
    Given "apps/<app>/Dockerfile" exists
    When the developer reads the file
    Then the file must contain a comment referencing "feature 35"
    And the file must not contain any FROM, RUN, COPY, or CMD instructions

    Examples:
      | app    |
      | auth   |
      | api    |
      | mastra |
      | ui     |

  Scenario Outline: Application project.json tags encode scope correctly
    Given "apps/<app>/project.json" exists
    When the developer reads the tags array
    Then the tags must include "<scope>"
    And the tags must include "type:app"

    Examples:
      | app    | scope        |
      | auth   | scope:auth   |
      | api    | scope:api    |
      | mastra | scope:mastra |
      | ui     | scope:ui     |

  Scenario Outline: Application project.json has empty targets
    Given "apps/<app>/project.json" exists
    When the developer reads the targets object
    Then targets must be an empty object "{}"
    And no build, lint, or test targets are defined at this stage

    Examples:
      | app    |
      | auth   |
      | api    |
      | mastra |
      | ui     |

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 3: Package Project Structure
  # ─────────────────────────────────────────────────────────────

  Scenario Outline: Each TypeScript package has the required directory structure
    Given the repository root contains a "packages/" directory
    When the developer inspects "packages/<pkg>/"
    Then "packages/<pkg>/src/" must exist
    And "packages/<pkg>/src/index.ts" must exist
    And "packages/<pkg>/project.json" must exist
    And "packages/<pkg>/project.json" must contain "name" equal to "<pkg>"
    And "packages/<pkg>/project.json" must contain "projectType" equal to "library"

    Examples:
      | pkg          |
      | shared-types |
      | api-client   |
      | auth-client  |

  Scenario: shared-types has all required placeholder source files
    Given "packages/shared-types/" exists
    When the developer lists the contents of "packages/shared-types/src/"
    Then the following files must be present:
      | task.ts   |
      | agenda.ts |
      | client.ts |
      | auth.ts   |
      | api.ts    |
      | index.ts  |
    And each file must contain a comment referencing "feature 01"
    And no file may contain any TypeScript type or interface declarations

  Scenario Outline: Database packages have migrations and seeds directories
    Given "packages/<pkg>/" exists
    When the developer inspects the directory
    Then "packages/<pkg>/migrations/" must exist
    And "packages/<pkg>/seeds/" must exist
    And "packages/<pkg>/project.json" must exist
    And "packages/<pkg>/project.json" must contain "projectType" equal to "library"
    And "packages/<pkg>/src/" must NOT exist at this stage

    Examples:
      | pkg           |
      | database      |
      | auth-database |

  Scenario Outline: Package project.json tags encode type correctly
    Given "packages/<pkg>/project.json" exists
    When the developer reads the tags array
    Then the tags must include "<type>"

    Examples:
      | pkg           | type             |
      | shared-types  | type:types       |
      | api-client    | type:client      |
      | auth-client   | type:client      |
      | database      | type:migrations  |
      | auth-database | type:migrations  |

  Scenario: api-client declares implicit dependency on shared-types
    Given "packages/api-client/project.json" exists
    When the developer reads the implicitDependencies array
    Then it must contain "shared-types"

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 4: Terraform Infrastructure Scaffolding
  # ─────────────────────────────────────────────────────────────

  Scenario: Terraform root module files exist as placeholders
    Given "infra/terraform/" exists
    When the developer lists the root files
    Then "infra/terraform/main.tf" must exist
    And "infra/terraform/variables.tf" must exist
    And "infra/terraform/outputs.tf" must exist
    And each file must contain a comment referencing "feature 02"
    And no file may contain any Terraform resource or provider blocks

  Scenario Outline: Terraform module subdirectories exist
    Given "infra/terraform/modules/" exists
    When the developer inspects the modules directory
    Then "infra/terraform/modules/<module>/" must exist

    Examples:
      | module             |
      | networking         |
      | database           |
      | auth-database      |
      | container-registry |
      | auth               |
      | api                |
      | mastra             |
      | ui                 |
      | secrets            |
      | dns                |
      | iam                |

  Scenario Outline: Terraform environment variable files exist
    Given "infra/terraform/environments/" exists
    When the developer inspects the environments directory
    Then "infra/terraform/environments/<env>.tfvars" must exist
    And the file must contain a comment referencing "feature 02"

    Examples:
      | env        |
      | dev        |
      | staging    |
      | production |

  Scenario: infra project.json is registered with Nx
    Given "infra/terraform/project.json" exists
    When the developer reads the file
    Then "name" must equal "infra"
    And "projectType" must equal "library"
    And "tags" must include "scope:infra"
    And "tags" must include "type:terraform"
    And "targets" must be an empty object

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 5: Nx Workspace Integrity
  # ─────────────────────────────────────────────────────────────

  Scenario: nx show projects lists exactly 10 projects
    Given the monorepo is fully scaffolded
    And "npm install" has been run
    When the developer runs "nx show projects"
    Then the output must contain exactly these project names:
      | auth          |
      | api           |
      | mastra        |
      | ui            |
      | shared-types  |
      | api-client    |
      | auth-client   |
      | database      |
      | auth-database |
      | infra         |

  Scenario: Nx dependency graph has no circular dependencies
    Given all project.json files exist
    And "npm install" has been run
    When the developer runs "nx graph --file=graph-output.json"
    Then the command exits with code 0
    And the output contains no "circular dependency" warnings

  Scenario: No application source code is committed in this feature
    Given the monorepo scaffolding is complete
    When the developer audits all committed TypeScript files
    Then no file may contain a class, function, or type declaration
    Except placeholder comments and stub index.ts files with comment-only content

  # ─────────────────────────────────────────────────────────────
  # SCENARIO GROUP 6: .gitignore
  # ─────────────────────────────────────────────────────────────

  Scenario: .gitignore excludes Nx cache directories
    Given ".gitignore" exists at the repository root
    When the developer runs "git status" after "npm install"
    Then ".nx/cache" must not appear as an untracked file
    And "node_modules/" must not appear as an untracked file
    And "dist/" must not appear as an untracked file

  Scenario: .gitignore excludes the job-queue directory
    Given ".gitignore" exists at the repository root
    And a directory "/job-queue/" exists with spec files
    When the developer runs "git status"
    Then "/job-queue/" must not appear as an untracked file

  Scenario: .gitignore does not exclude source files
    Given ".gitignore" exists at the repository root
    When the developer creates "apps/api/src/main.ts"
    And runs "git status"
    Then "apps/api/src/main.ts" must appear as an untracked file
```
