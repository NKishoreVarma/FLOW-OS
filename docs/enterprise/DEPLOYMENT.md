# FLOW OS Enterprise Deployment Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 16 with `pgvector` extension
- Redis 7+
- Docker 24+ (for container deployments)

## Environment Variables

### Required
```bash
DATABASE_URL=postgresql://user:pass@host:5432/flowdb
REDIS_URL=redis://host:6379
JWT_SECRET=<min 32 chars — openssl rand -hex 32>
GEMINI_API_KEY=<Google AI key>
```

### Optional (Enterprise)
```bash
GOOGLE_CLIENT_ID=<Gmail/Calendar OAuth>
GOOGLE_CLIENT_SECRET=
GITHUB_TOKEN=<GitHub PAT>
VAULT_ROOT=/data/vaults
REPORT_ROOT=/data/reports
CORS_ORIGIN=https://app.example.com
WS_AUTH_REQUIRED=true
QUEUE_SHARDS=4
LOG_FORMAT=json
LOG_SINK=stdout
NODE_ENV=production
```

## Docker Deployment

```bash
# Build
docker build -t flow-os:latest .

# Run (single node)
docker-compose up -d

# Run (enterprise HA)
docker-compose -f install/docker-compose.enterprise.yml up -d
```

## Kubernetes Deployment

```bash
# Create namespace + secrets
kubectl apply -f install/kubernetes/ingress.yaml   # namespace + PVCs

kubectl create secret generic flow-os-secrets \
  --from-literal=jwtSecret="$JWT_SECRET" \
  --from-literal=databaseUrl="$DATABASE_URL" \
  --from-literal=redisUrl="$REDIS_URL" \
  --from-literal=geminiApiKey="$GEMINI_API_KEY" \
  -n flow-os

# Deploy
kubectl apply -f install/kubernetes/deployment.yaml
kubectl apply -f install/kubernetes/service.yaml

# Verify
kubectl rollout status deployment/flow-os-app -n flow-os
kubectl get pods -n flow-os
```

## Helm Deployment

```bash
# Install / upgrade
helm upgrade --install flow-os install/helm/ \
  --namespace flow-os --create-namespace \
  --set secrets.jwtSecret="$JWT_SECRET" \
  --set secrets.databaseUrl="$DATABASE_URL" \
  --set secrets.redisUrl="$REDIS_URL" \
  --set ingress.hosts[0].host=app.example.com \
  -f install/helm/values.production.yaml
```

## Database Setup

```bash
# Apply pgvector extension
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run Prisma migrations
npx prisma migrate deploy

# Apply Phase 15 tables
psql $DATABASE_URL -f scripts/migrate-phase15.sql

# Apply other phase migrations
psql $DATABASE_URL -f scripts/migrate-governance-5-3-b.sql
psql $DATABASE_URL -f scripts/migrate-execution-engine-v14.sql
psql $DATABASE_URL -f scripts/migrate-event-platform-v11-0.sql
psql $DATABASE_URL -f scripts/migrate-graph-engine-v11-1.sql
```

## Health Verification

```bash
curl https://app.example.com/health/live    # 200 OK
curl https://app.example.com/health/ready   # 200 {"status":"ready"}
curl https://app.example.com/metrics/infra  # Infrastructure metrics
```

## Post-Deploy Checklist

- [ ] All health probes return 200
- [ ] WebSocket connects and sends `CONNECTION_ACK`
- [ ] `/api/auth/signup` returns JWT
- [ ] At least one workspace ingestion succeeds
- [ ] `/api/intelligence/health-score` returns a score
- [ ] Vault directory is writable
- [ ] Redis connection pool healthy
- [ ] BullMQ queues draining
- [ ] `WS_AUTH_REQUIRED=true` in production
- [ ] `CORS_ORIGIN` set to specific domain
- [ ] Backup schedule configured
