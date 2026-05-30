resource "cloudflare_dns_record" "apex_a" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  type    = "A"
  content = hcloud_server.kavanow.ipv4_address
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "apex_aaaa" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  type    = "AAAA"
  content = hcloud_server.kavanow.ipv6_address
  proxied = true
  ttl     = 1
}
