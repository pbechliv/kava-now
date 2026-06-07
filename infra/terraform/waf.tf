# Smoke tests (GitHub runners) and uptime monitors probe from datacenter IPs
# that Cloudflare's security level / browser integrity check answer with 403
# challenges. Skip those two products for the health endpoint and the SPA
# shell — both public, unauthenticated, and edge-cached. L7 DDoS protection
# is a separate layer and unaffected by this skip.
resource "cloudflare_ruleset" "waf_custom" {
  zone_id = var.cloudflare_zone_id
  name    = "kavanow-waf"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules = [
    {
      description = "Allow automated probes to the health endpoint + SPA shell"
      expression  = "(http.request.uri.path eq \"/api/health\" or http.request.uri.path eq \"/\")"
      action      = "skip"
      action_parameters = {
        products = ["bic", "securityLevel"]
      }
      logging = {
        enabled = true
      }
    },
  ]
}
