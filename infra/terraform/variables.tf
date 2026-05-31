variable "name_prefix" {
  type        = string
  description = "Resource name prefix."
  default     = "matching-server-shogi"
}

variable "aws_region" {
  type        = string
  description = "AWS region."
  default     = "ap-northeast-1"
}

variable "lambda_zip_path" {
  type        = string
  description = "Path to the built matching server Lambda zip artifact."
}

variable "lambda_runtime" {
  type        = string
  description = "Lambda runtime."
  default     = "nodejs22.x"
}

variable "lambda_handler" {
  type        = string
  description = "Lambda handler entrypoint."
  default     = "index.handler"
}

variable "lambda_timeout_seconds" {
  type        = number
  description = "Lambda timeout in seconds."
  default     = 30
}

variable "lambda_memory_mb" {
  type        = number
  description = "Lambda memory size in MB."
  default     = 512
}

variable "matchmaking_batch_size" {
  type        = number
  description = "Maximum matches a matchmaking worker invocation creates."
  default     = 20
}

variable "matchmaking_bucket_scan_limit" {
  type        = number
  description = "Maximum queue lookup rows read while discovering waiting rating buckets."
  default     = 50
}

variable "matchmaking_bucket_candidate_limit" {
  type        = number
  description = "Maximum queue lookup rows read from a single rating bucket."
  default     = 25
}

variable "matchmaking_sqs_batch_size" {
  type        = number
  description = "SQS messages delivered to one matchmaking worker invocation."
  default     = 10
}

variable "matchmaking_worker_max_concurrency" {
  type        = number
  description = "Maximum concurrent Lambda invocations for SQS-driven matchmaking workers."
  default     = 2
}

variable "matchmaking_queue_visibility_timeout_seconds" {
  type        = number
  description = "Visibility timeout for matchmaking request messages."
  default     = 180
}

variable "outbox_worker_rate_expression" {
  type        = string
  description = "EventBridge schedule expression for outbox delivery."
  default     = "rate(1 minute)"
}

variable "stage_name" {
  type        = string
  description = "API Gateway WebSocket stage name."
  default     = "prod"
}

variable "bff_base_url" {
  type        = string
  description = "BFF base URL for catalog/setup/result internal calls."
}

variable "matching_bff_internal_token" {
  type        = string
  description = "Shared internal token for matching server -> BFF calls."
  sensitive   = true
}

variable "matching_ticket_secret" {
  type        = string
  description = "HMAC secret used to verify BFF-issued matchmaking tickets."
  sensitive   = true
}

variable "app_shogi_root" {
  type        = string
  description = "Optional app.shogi root path for non-Lambda local compatibility. Leave empty for Lambda."
  default     = ""
}
