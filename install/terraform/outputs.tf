output "eks_cluster_endpoint"  { value = module.eks.cluster_endpoint }
output "eks_cluster_name"      { value = module.eks.cluster_name }
output "rds_endpoint"          { value = aws_db_instance.postgres.endpoint }
output "redis_endpoint"        { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
output "ecr_repository_url"    { value = aws_ecr_repository.flow_os.repository_url }
output "vpc_id"                { value = module.vpc.vpc_id }
output "database_url"          {
  value     = "postgresql://flow:${var.db_password}@${aws_db_instance.postgres.endpoint}/flowdb"
  sensitive = true
}
