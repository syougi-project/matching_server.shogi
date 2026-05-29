# matching_server.shogi Terraform

This stack provisions the AWS runtime for the online match server:

- API Gateway WebSocket API
- Lambda handler for `$connect`, `$disconnect`, and message routes
- DynamoDB runtime tables with TTL enabled
- IAM permissions for DynamoDB, CloudWatch Logs, and `execute-api:ManageConnections`
- EventBridge schedules for matchmaking, reconnect timeout, and outbox workers

DynamoDB is intentionally used only for temporary runtime state. Durable records remain in `bff.shogi` / Postgres.

## Deploy

```bash
bun run tf:sync-env
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Copy `terraform.tfvars.example` to `terraform.tfvars` and set:

- `lambda_zip_path`

The BFF-derived values below are generated into ignored `bff.auto.tfvars` from `../bff.shogi/.env`:

- `bff_base_url` from `EXPO_PUBLIC_API_BASE_URL`
- `matching_bff_internal_token` from `MATCHING_BFF_INTERNAL_TOKEN`
- `matching_ticket_secret` from `MATCHING_TICKET_SECRET`

The produced `websocket_url` is the value app clients should use as `EXPO_PUBLIC_MATCHING_SERVER_WS_URL` after replacing `https://` with `wss://` if needed by the client environment.
