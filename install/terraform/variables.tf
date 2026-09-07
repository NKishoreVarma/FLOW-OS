variable "aws_region"       { default = "us-east-1" }
variable "project_name"     { default = "flow-os" }
variable "environment"      { default = "production" }
variable "vpc_cidr"         { default = "10.0.0.0/16" }
variable "availability_zones" { type = list(string); default = ["us-east-1a","us-east-1b","us-east-1c"] }
variable "private_subnet_cidrs" { type = list(string); default = ["10.0.1.0/24","10.0.2.0/24","10.0.3.0/24"] }
variable "public_subnet_cidrs"  { type = list(string); default = ["10.0.101.0/24","10.0.102.0/24","10.0.103.0/24"] }
variable "min_nodes"          { default = 3 }
variable "max_nodes"          { default = 20 }
variable "desired_nodes"      { default = 3 }
variable "node_instance_type" { default = "t3.xlarge" }
variable "db_instance_class"  { default = "db.r6g.large" }
variable "db_password"        { sensitive = true }
variable "redis_node_type"    { default = "cache.r6g.large" }
