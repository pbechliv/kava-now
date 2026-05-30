resource "hcloud_ssh_key" "deploy" {
  name       = "kavanow-deploy"
  public_key = var.ssh_pub_key
}

resource "hcloud_firewall" "public" {
  name = "kavanow-public"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "kavanow" {
  name         = "kavanow-prod"
  image        = "ubuntu-26.04"
  server_type  = var.vm_type
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.deploy.id]
  backups      = true
  firewall_ids = [hcloud_firewall.public.id]
  user_data = templatefile("${path.module}/cloud-init.yaml", {
    deploy_pub_key = var.ssh_pub_key
  })
}
