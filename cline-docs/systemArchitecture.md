# System Architecture

## High-Level Overview

iExcel Automation is a meeting transcript-to-task automation platform. It ingests meeting transcripts from multiple sources (text, Grain recordings), uses AI agents to extract structured action items, manages task approval workflows, syncs tasks bidirectionally with Asana, and generates meeting agendas delivered via Google Docs and Email.

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Clients
        WebUI["Web UI<br/>(Next.js)"]
        Terminal["Terminal<br/>(Claude Code MCP)"]
    end

    subgraph Core["Core Services"]
        Auth["Auth Service<br/>(:3001)"]
        API["Fastify API<br/>(:4000)"]
        Mastra["Mastra Engine<br/>(:3000)"]
    end

    subgraph Data
        PG["PostgreSQL"]
        Redis["Redis"]
    end

    subgraph External["External Services"]
        Asana["Asana API"]
        GDocs["Google Docs API"]
        Email["Email (Resend)"]
        Grain["Grain (V2)"]
    end

    subgraph Infra["GCP Infrastructure"]
        CloudRun["Cloud Run"]
        CloudSQL["Cloud SQL"]
        SecretMgr["Secret Manager"]
        ArtifactReg["Artifact Registry"]
    end

    WebUI -->|REST| API
    Terminal -->|MCP| Mastra
    API -->|OAuth2| Auth
    WebUI -->|OAuth2| Auth
    API -->|Workflow Triggers| Mastra
    Mastra -->|BullMQ| Redis
    API --> PG
    Auth --> PG
    Mastra --> PG
    API -->|Push Tasks| Asana
    API -->|Reconcile Status| Asana
    API -->|Deliver Agenda| GDocs
    API -->|Send Agenda| Email

    CloudRun -.->|Hosts| Core
    CloudSQL -.->|Managed| PG
```

## Service Communication

| Source | Target | Protocol | Purpose |
|--------|--------|----------|---------|
| Web UI | API | REST/HTTP | CRUD operations, workflow triggers |
| Web UI | Auth | OAuth2 | User authentication (authorization code flow) |
| Terminal | Mastra | MCP | CLI tool invocations via Claude Code |
| Terminal | Auth | OAuth2 | Device flow authentication |
| API | Auth | HTTP | Token validation, client credentials |
| API | Mastra | REST | Trigger intake/agenda workflows |
| API | Asana | REST | Push tasks, pull status reconciliation |
| API | Google Docs | REST | Deliver agendas as Google Docs |
| API | Email | REST | Send agenda emails via Resend |
| Mastra | Redis | BullMQ | Background job processing |
| Mastra | API | REST | Read/write tasks, transcripts, agendas |

## Database Schema

```mermaid
erDiagram
    users ||--o{ client_users : "many-to-many"
    clients ||--o{ client_users : "many-to-many"
    clients ||--o{ transcripts : has
    clients ||--o{ tasks : has
    clients ||--o{ agendas : has
    transcripts ||--o{ tasks : generates
    agendas ||--o{ agenda_items : contains
    tasks }o--|| agenda_items : "referenced in"
    clients ||--o{ workflow_runs : triggers
    clients ||--o{ import_jobs : imports

    users {
        uuid id PK
        string email
        string name
        string role
    }
    clients {
        uuid id PK
        string short_id
        string name
        jsonb email_recipients
        jsonb asana_credentials
    }
    transcripts {
        uuid id PK
        uuid client_id FK
        string source_type
        jsonb normalized_segments
        string status
    }
    tasks {
        uuid id PK
        uuid client_id FK
        uuid transcript_id FK
        string short_id
        string title
        jsonb description
        string status
        string priority
        interval estimated_time
        jsonb external_ref
    }
    agendas {
        uuid id PK
        uuid client_id FK
        string short_id
        jsonb content
        string status
    }
    workflow_runs {
        uuid id PK
        uuid client_id FK
        string workflow_type
        string status
    }
    import_jobs {
        uuid id PK
        uuid client_id FK
        string status
    }
```

## Key Processes

### 1. Transcript Intake Pipeline
```
Transcript Upload → Input Normalizer → NormalizedTranscript → DB Storage
    → Workflow Orchestration → Mastra Intake Agent → NormalizedTask[]
    → Batch Task Creation → User Review (UI)
```

### 2. Task Approval & Push
```
User Approves Tasks (UI) → Status: approved → Output Normalizer
    → Asana Push → Status: pushed → external_ref populated
```

### 3. Status Reconciliation
```
Cron/Manual Trigger → Fetch Asana Status → Compare with DB
    → Update internal status (completed) → Cache in Postgres
```

### 4. Agenda Generation Pipeline
```
Trigger Agenda Workflow → Mastra Agenda Agent → ProseMirror JSON
    → Agenda Created in DB → Delivery Adapters (Google Docs / Email)
```

### 5. Authentication Flows
```
Web UI: Authorization Code Flow → Auth Service → JWT (access + refresh)
Terminal: Device Flow → Auth Service → JWT → Token Manager cache
API-to-API: Client Credentials → Auth Service → Service token
```
