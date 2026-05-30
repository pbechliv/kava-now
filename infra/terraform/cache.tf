resource "cloudflare_ruleset" "cache_rules" {
  zone_id = var.cloudflare_zone_id
  name    = "kavanow-cache"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules = [
    {
      description = "Bypass cache for /api/*"
      expression  = "(starts_with(http.request.uri.path, \"/api/\"))"
      action      = "set_cache_settings"
      action_parameters = {
        cache = false
      }
    },
    {
      description = "Short edge TTL for SPA shell"
      expression  = "(http.request.uri.path eq \"/\" or http.request.uri.path eq \"/index.html\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 60
        }
        browser_ttl = {
          mode    = "override_origin"
          default = 0
        }
      }
    },
  ]
}

# Zone settings — each setting is its own resource in v5
# (cloudflare_zone_settings_override was removed).
resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "ssl"
  value      = "strict"
}

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zone_setting" "automatic_https_rewrites" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "automatic_https_rewrites"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "min_tls_version"
  value      = "1.2"
}

resource "cloudflare_zone_setting" "opportunistic_encryption" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "opportunistic_encryption"
  value      = "on"
}

resource "cloudflare_zone_setting" "brotli" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "brotli"
  value      = "on"
}

resource "cloudflare_zone_setting" "http3" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "http3"
  value      = "on"
}

resource "cloudflare_zone_setting" "early_hints" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "early_hints"
  value      = "on"
}
