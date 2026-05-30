output "vm_ipv4" {
  value       = hcloud_server.kavanow.ipv4_address
  description = "Public IPv4 of the production VM. Set GitHub secret HETZNER_HOST to this."
}

output "vm_ipv6" {
  value       = hcloud_server.kavanow.ipv6_address
  description = "Public IPv6 of the production VM."
}
