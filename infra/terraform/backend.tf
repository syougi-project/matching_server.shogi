terraform {
  backend "s3" {
    bucket       = "basi-magic-shogi-terraform-state-apne1"
    key          = "matching-server-shogi/sandbox/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
