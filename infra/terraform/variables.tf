variable "hcloud_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_zone_id" {
  type = string
}

variable "domain" {
  type    = string
  default = "kavanow.gr"
}

variable "ssh_pub_key" {
  type        = string
  description = "Contents of ~/.ssh/kavanow_deploy.pub"
}

variable "vm_type" {
  type    = string
  default = "cx23"
}

variable "location" {
  type    = string
  default = "fsn1"
}
