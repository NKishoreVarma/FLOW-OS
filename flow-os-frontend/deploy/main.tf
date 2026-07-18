# FLOW OS Enterprise - Foundation IaC
# Provisioning standard multi-tenant infrastructure

provider "aws" {
  region = var.aws_region
}

# PostgreSQL Database (pgvector enabled)
resource "aws_rds_cluster" "flow_db" {
  cluster_identifier      = "flow-os-enterprise-cluster"
  engine                  = "aurora-postgresql"
  engine_version          = "15.3"
  database_name           = "flowos"
  master_username         = var.db_username
  master_password         = var.db_password
  backup_retention_period = 7
  storage_encrypted       = true
  
  serverlessv2_scaling_configuration {
    max_capacity = 64.0
    min_capacity = 2.0
  }
}

# Redis for BullMQ Job Queues
resource "aws_elasticache_cluster" "flow_redis" {
  cluster_id           = "flow-os-queue"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
}

# EKS Cluster for multi-tenant microservices
resource "aws_eks_cluster" "flow_eks" {
  name     = "flow-os-k8s"
  role_arn = aws_iam_role.eks_role.arn

  vpc_config {
    subnet_ids = var.subnet_ids
  }
}
