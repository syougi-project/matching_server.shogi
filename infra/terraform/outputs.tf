output "runtime_table_names" {
  value = {
    for key, table in aws_dynamodb_table.runtime : key => table.name
  }
}

output "queue_lookup_table_name" {
  value = aws_dynamodb_table.queue_lookup.name
}

output "websocket_api_id" {
  value = aws_apigatewayv2_api.websocket.id
}

output "websocket_url" {
  value = "${aws_apigatewayv2_api.websocket.api_endpoint}/${aws_apigatewayv2_stage.websocket.name}"
}

output "lambda_function_name" {
  value = aws_lambda_function.websocket.function_name
}

output "lambda_role_arn" {
  value = aws_iam_role.lambda.arn
}
