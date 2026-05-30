#!/usr/bin/env bash
set -euo pipefail

terraform_dir="${1:-infra/terraform}"
name_prefix="${TF_IMPORT_NAME_PREFIX:-matching-server-shogi}"

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform command not found" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws command not found" >&2
  exit 1
fi

cd "$terraform_dir"

state_has() {
  terraform state show "$1" >/dev/null 2>&1
}

try_import() {
  local address="$1"
  local import_id="$2"

  if state_has "$address"; then
    echo "state already has $address"
    return 0
  fi

  if [[ -z "$import_id" ]]; then
    echo "skip $address: import id not found"
    return 0
  fi

  echo "importing $address"
  terraform import -no-color -lock-timeout=60s "$address" "$import_id"
}

resource_exists() {
  local kind="$1"
  local name="$2"

  case "$kind" in
    dynamodb)
      aws dynamodb describe-table --table-name "$name" >/dev/null 2>&1
      ;;
    log-group)
      aws logs describe-log-groups --log-group-name-prefix "$name" \
        --query 'logGroups[?logGroupName==`'"$name"'`].logGroupName' \
        --output text | grep -Fx "$name" >/dev/null 2>&1
      ;;
    iam-role)
      aws iam get-role --role-name "$name" >/dev/null 2>&1
      ;;
    iam-policy)
      aws iam list-policies --scope Local \
        --query 'Policies[?PolicyName==`'"$name"'`].Arn' \
        --output text | grep -F . >/dev/null 2>&1
      ;;
    lambda)
      aws lambda get-function --function-name "$name" >/dev/null 2>&1
      ;;
    *)
      echo "unsupported resource kind: $kind" >&2
      return 1
      ;;
  esac
}

policy_arn() {
  local name="$1"
  aws iam list-policies --scope Local \
    --query 'Policies[?PolicyName==`'"$name"'`].Arn | [0]' \
    --output text 2>/dev/null | sed '/^None$/d'
}

lambda_permission_id() {
  local function_name="$1"
  local statement_id="$2"
  local policy

  policy="$(aws lambda get-policy --function-name "$function_name" --query 'Policy' --output text 2>/dev/null || true)"
  if [[ "$policy" == *"\"Sid\":\"$statement_id\""* ]]; then
    printf '%s/%s\n' "$function_name" "$statement_id"
  fi
}

for table in connections queue matches moves idempotency outbox; do
  table_name="${name_prefix}-${table}"
  address="aws_dynamodb_table.runtime[\"${table}\"]"
  if resource_exists dynamodb "$table_name"; then
    try_import "$address" "$table_name"
  else
    echo "skip $address: $table_name does not exist"
  fi
done

queue_lookup_name="${name_prefix}-queue-lookup"
if resource_exists dynamodb "$queue_lookup_name"; then
  try_import "aws_dynamodb_table.queue_lookup" "$queue_lookup_name"
else
  echo "skip aws_dynamodb_table.queue_lookup: $queue_lookup_name does not exist"
fi

log_group_name="/aws/lambda/${name_prefix}-websocket"
if resource_exists log-group "$log_group_name"; then
  try_import "aws_cloudwatch_log_group.lambda" "$log_group_name"
else
  echo "skip aws_cloudwatch_log_group.lambda: $log_group_name does not exist"
fi

role_name="${name_prefix}-lambda-role"
if resource_exists iam-role "$role_name"; then
  try_import "aws_iam_role.lambda" "$role_name"
else
  echo "skip aws_iam_role.lambda: $role_name does not exist"
fi

policy_name="${name_prefix}-lambda-policy"
policy_arn_value=""
if resource_exists iam-policy "$policy_name"; then
  policy_arn_value="$(policy_arn "$policy_name")"
  try_import "aws_iam_policy.lambda" "$policy_arn_value"
else
  echo "skip aws_iam_policy.lambda: $policy_name does not exist"
fi

if [[ -n "$policy_arn_value" ]] && resource_exists iam-role "$role_name"; then
  try_import "aws_iam_role_policy_attachment.lambda" "${role_name}/${policy_arn_value}"
else
  echo "skip aws_iam_role_policy_attachment.lambda: role or policy missing"
fi

function_name="${name_prefix}-websocket"
if resource_exists lambda "$function_name"; then
  try_import "aws_lambda_function.websocket" "$function_name"
else
  echo "skip aws_lambda_function.websocket: $function_name does not exist"
fi

permission_id="$(lambda_permission_id "$function_name" "AllowExecutionFromApiGatewayWebSocket")"
if [[ -n "$permission_id" ]]; then
  try_import "aws_lambda_permission.api_gateway" "$permission_id"
else
  echo "skip aws_lambda_permission.api_gateway: permission not found"
fi
