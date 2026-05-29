terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  tables = {
    connections = {
      hash_key = "connectionId"
    }
    queue = {
      hash_key = "queueEntryId"
    }
    matches = {
      hash_key = "matchId"
    }
    moves = {
      hash_key  = "matchId"
      range_key = "moveNo"
    }
    idempotency = {
      hash_key = "idempotencyKey"
    }
    outbox = {
      hash_key = "eventId"
    }
  }

  lambda_environment = {
    MATCHING_CONNECTIONS_TABLE              = aws_dynamodb_table.runtime["connections"].name
    MATCHING_QUEUE_TABLE                    = aws_dynamodb_table.runtime["queue"].name
    MATCHING_QUEUE_LOOKUP_TABLE             = aws_dynamodb_table.queue_lookup.name
    MATCHING_MATCHES_TABLE                  = aws_dynamodb_table.runtime["matches"].name
    MATCHING_MOVES_TABLE                    = aws_dynamodb_table.runtime["moves"].name
    MATCHING_IDEMPOTENCY_TABLE              = aws_dynamodb_table.runtime["idempotency"].name
    MATCHING_OUTBOX_TABLE                   = aws_dynamodb_table.runtime["outbox"].name
    MATCHING_BFF_BASE_URL                   = var.bff_base_url
    MATCHING_BFF_INTERNAL_TOKEN             = var.matching_bff_internal_token
    MATCHING_TICKET_SECRET                  = var.matching_ticket_secret
    APP_SHOGI_ROOT                          = var.app_shogi_root
    MATCHING_RATING_BUCKET_SIZE             = "100"
    MATCHING_RECONNECT_GRACE_SECONDS        = "30"
    MATCHING_QUEUE_TTL_SECONDS              = "120"
    AWS_NODEJS_CONNECTION_REUSE_ENABLED     = "1"
    API_GATEWAY_WEBSOCKET_MANAGEMENT_DOMAIN = "${aws_apigatewayv2_api.websocket.id}.execute-api.${var.aws_region}.amazonaws.com"
    API_GATEWAY_WEBSOCKET_STAGE             = var.stage_name
  }
}

resource "aws_dynamodb_table" "runtime" {
  for_each     = local.tables
  name         = "${var.name_prefix}-${each.key}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash_key
  range_key    = try(each.value.range_key, null)

  attribute {
    name = each.value.hash_key
    type = "S"
  }

  dynamic "attribute" {
    for_each = try(each.value.range_key, null) == null ? [] : [each.value.range_key]
    content {
      name = attribute.value
      type = "N"
    }
  }

  dynamic "attribute" {
    for_each = each.key == "connections" ? ["userKey"] : []
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "attribute" {
    for_each = each.key == "queue" ? ["activeUserId"] : []
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "attribute" {
    for_each = each.key == "outbox" ? ["deliveryStatus"] : []
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.key == "connections" ? ["userId-index"] : []
    content {
      name            = global_secondary_index.value
      hash_key        = "userKey"
      projection_type = "ALL"
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.key == "queue" ? ["activeUserId-index"] : []
    content {
      name            = global_secondary_index.value
      hash_key        = "activeUserId"
      projection_type = "ALL"
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.key == "outbox" ? ["deliveryStatus-index"] : []
    content {
      name            = global_secondary_index.value
      hash_key        = "deliveryStatus"
      projection_type = "ALL"
    }
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "queue_lookup" {
  name         = "${var.name_prefix}-queue-lookup"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "statusBucket"
  range_key    = "enqueuedAtQueueEntryId"

  attribute {
    name = "statusBucket"
    type = "S"
  }

  attribute {
    name = "enqueuedAtQueueEntryId"
    type = "S"
  }

  attribute {
    name = "queueStatus"
    type = "S"
  }

  attribute {
    name = "ratingBucket"
    type = "N"
  }

  global_secondary_index {
    name            = "waiting-buckets-index"
    hash_key        = "queueStatus"
    range_key       = "ratingBucket"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.name_prefix}-websocket"
  retention_in_days = 14
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name_prefix}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "lambda" {
  statement {
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }

  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
    ]

    resources = concat(
      [for table in aws_dynamodb_table.runtime : table.arn],
      [for table in aws_dynamodb_table.runtime : "${table.arn}/index/*"],
      [aws_dynamodb_table.queue_lookup.arn, "${aws_dynamodb_table.queue_lookup.arn}/index/*"],
    )
  }

  statement {
    actions = ["execute-api:ManageConnections"]

    resources = [
      "${aws_apigatewayv2_api.websocket.execution_arn}/${var.stage_name}/POST/@connections/*",
    ]
  }
}

resource "aws_iam_policy" "lambda" {
  name   = "${var.name_prefix}-lambda-policy"
  policy = data.aws_iam_policy_document.lambda.json
}

resource "aws_iam_role_policy_attachment" "lambda" {
  role       = aws_iam_role.lambda.name
  policy_arn = aws_iam_policy.lambda.arn
}

resource "aws_lambda_function" "websocket" {
  function_name    = "${var.name_prefix}-websocket"
  role             = aws_iam_role.lambda.arn
  runtime          = var.lambda_runtime
  handler          = var.lambda_handler
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  timeout          = var.lambda_timeout_seconds
  memory_size      = var.lambda_memory_mb

  environment {
    variables = local.lambda_environment
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy_attachment.lambda,
  ]
}

resource "aws_apigatewayv2_api" "websocket" {
  name                       = "${var.name_prefix}-ws"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.websocket.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.websocket.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "connect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "enter_queue" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "enter_queue"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "cancel_queue" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "cancel_queue"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "make_move" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "make_move"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "resign" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "resign"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "websocket" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = var.stage_name
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromApiGatewayWebSocket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*"
}

locals {
  worker_schedules = {
    matchmaking = {
      expression = var.matchmaking_worker_rate_expression
      payload    = { worker = "matchmaking" }
    }
    reconnect_timeout = {
      expression = var.reconnect_timeout_worker_rate_expression
      payload    = { worker = "reconnect_timeout" }
    }
    outbox = {
      expression = var.outbox_worker_rate_expression
      payload    = { worker = "outbox" }
    }
  }
}

resource "aws_cloudwatch_event_rule" "worker" {
  for_each            = local.worker_schedules
  name                = "${var.name_prefix}-${each.key}"
  schedule_expression = each.value.expression
}

resource "aws_cloudwatch_event_target" "worker" {
  for_each = local.worker_schedules
  rule     = aws_cloudwatch_event_rule.worker[each.key].name
  arn      = aws_lambda_function.websocket.arn
  input    = jsonencode(each.value.payload)
}

resource "aws_lambda_permission" "eventbridge_worker" {
  for_each      = local.worker_schedules
  statement_id  = "AllowEventBridge${replace(each.key, "_", "")}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.websocket.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.worker[each.key].arn
}
