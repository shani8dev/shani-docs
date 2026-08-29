---
title: Kubernetes — Networking & Ingress
section: Self-Hosting & Servers
updated: 2026-08-28
---

## Networking & Ingress

### Cilium (eBPF CNI — Primary)

**Purpose:** High-performance CNI built on eBPF. Replaces Flannel, Calico, and kube-proxy in one Helm chart. Enforces NetworkPolicies at the kernel level (no iptables), provides L7 HTTP/gRPC/DNS-aware policy, transparent WireGuard node-to-node encryption, and Hubble for real-time flow observability.

> **Why Cilium over Flannel/Calico:** Flannel is L3-only with zero observability. Calico adds BGP but still relies on iptables. Cilium replaces both plus kube-proxy with a single eBPF stack: faster packet processing, L7 policy without sidecars, built-in flow inspection via Hubble, and optional Gateway API support.

#### Install k3s without Flannel/kube-proxy first

See [k3s install](#k3s-lightweight-cncf-kubernetes) — `--flannel-backend=none --disable-kube-proxy --disable-network-policy` are required before installing Cilium.

#### Install Cilium

```bash
nix-env -iA nixpkgs.cilium-cli nixpkgs.hubble

helm repo add cilium https://helm.cilium.io/
helm upgrade --install cilium cilium/cilium \
  --version 1.17.0 \
  --namespace kube-system \
  -f ~/k8s/cilium-values.yaml

cilium status
cilium connectivity test
```

```yaml
# ~/k8s/cilium-values.yaml
kubeProxyReplacement: true
k8sServiceHost: "127.0.0.1"           # k3s API server on localhost
k8sServicePort: "6443"

# Native routing — bypasses iptables entirely
routingMode: native
autoDirectNodeRoutes: true
ipv4NativeRoutingCIDR: "10.42.0.0/16"  # k3s default pod CIDR

# WireGuard transparent encryption (node-to-node)
encryption:
  enabled: true
  type: wireguard

# Hubble observability
hubble:
  enabled: true
  relay:
    enabled: true
  ui:
    enabled: true
  metrics:
    enabled: [dns, drop, tcp, http]

# Gateway API support (coexists with NGF)
gatewayAPI:
  enabled: true

# Built-in LB IPAM (can replace MetalLB for simple setups)
loadBalancer:
  algorithm: maglev
```

#### Firewall ports (multi-node)

```bash
# Remove Flannel VXLAN port if migrating from Flannel: --remove-port=8472/udp
sudo firewall-cmd --add-port=6443/tcp --permanent   # API server
sudo firewall-cmd --add-port=4240/tcp --permanent   # Cilium health
sudo firewall-cmd --add-port=4244/tcp --permanent   # Hubble relay
sudo firewall-cmd --add-port=4245/tcp --permanent   # Hubble peer
sudo firewall-cmd --add-port=51871/udp --permanent  # WireGuard
sudo firewall-cmd --add-port=10250/tcp --permanent  # kubelet
sudo firewall-cmd --reload
```

#### Hubble — live flow inspection

```bash
cilium hubble port-forward &

hubble observe --namespace myapp --follow
hubble observe --namespace myapp --protocol http --follow
hubble observe --verdict DROPPED --follow              # see policy denials in real time
hubble observe --from-pod myapp/frontend --to-pod myapp/backend
```

Port-forward UI: `kubectl -n kube-system port-forward svc/hubble-ui 12000:80 &`

**Caddy:** `hubble.home.local { tls internal; reverse_proxy localhost:12000 }`

#### L7 NetworkPolicy (HTTP-aware)

```yaml
# Allow only specific HTTP methods — standard NetworkPolicy cannot do this
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: myapp
spec:
  endpointSelector:
    matchLabels:
      app: backend
  ingress:
    - fromEndpoints:
        - matchLabels:
            app: frontend
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
          rules:
            http:
              - method: GET
                path: /api/.*
              - method: POST
                path: /api/orders
```

#### DNS-aware egress policy

```yaml
# Lock down which external hosts a pod can call
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: myapp-egress
  namespace: myapp
spec:
  endpointSelector:
    matchLabels:
      app: backend
  egress:
    - toFQDNs:
        - matchName: "api.stripe.com"
        - matchPattern: "*.amazonaws.com"
    - toEndpoints:
        - matchLabels:
            k8s:io.kubernetes.pod.namespace: kube-system
      toPorts:
        - ports:
            - port: "53"
              protocol: UDP
```

#### Migrating from Flannel to Cilium

```bash
sudo k3s etcd-snapshot save --name pre-cilium-$(date +%Y%m%d)

# On each node — remove stale CNI config
sudo rm /etc/cni/net.d/10-flannel.conflist
sudo ip link delete flannel.1 2>/dev/null || true
sudo ip link delete cni0 2>/dev/null || true

# Edit /etc/rancher/k3s/config.yaml — add:
# flannel-backend: "none"
# disable-kube-proxy: true
# disable-network-policy: true
sudo systemctl restart k3s

helm upgrade --install cilium cilium/cilium --namespace kube-system -f ~/k8s/cilium-values.yaml
cilium status --wait
```

---

## DNS

### CoreDNS (Cluster DNS)

**Purpose:** CoreDNS is the default cluster DNS in all distributions. Every Service gets a DNS record (`<svc>.<ns>.svc.cluster.local`). Every pod's `/etc/resolv.conf` is configured to use it automatically.

#### DNS resolution inside pods

```
# Pattern:                         Example
<svc>                              → myapp                          (same namespace only)
<svc>.<namespace>                  → myapp.production
<svc>.<namespace>.svc              → myapp.production.svc
<svc>.<namespace>.svc.cluster.local → myapp.production.svc.cluster.local  (always works)

# StatefulSet pods get stable DNS
<pod>.<svc>.<ns>.svc.cluster.local → postgres-0.postgres.data.svc.cluster.local

# Headless service returns all pod IPs via DNS A records
dig postgres.data.svc.cluster.local   # returns postgres-0, postgres-1, postgres-2 IPs
```

#### ndots and the search domain trap

`ndots:5` is the default — a query for `api.stripe.com` first tries:
1. `api.stripe.com.myapp.svc.cluster.local`
2. `api.stripe.com.svc.cluster.local`
3. `api.stripe.com.cluster.local`
4. `api.stripe.com.` (actual lookup)

This adds latency for every external call. Fix for latency-sensitive pods:

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"    # only try cluster.local search for short names; go direct for FQDNs
      - name: single-request-reopen   # prevents race condition in some DNS resolvers
```

#### Customise CoreDNS

```bash
kubectl -n kube-system edit configmap coredns
```

```
# Common Corefile additions:
.:53 {
    errors
    health
    ready
    kubernetes cluster.local in-addr.arpa ip6.arpa {
        pods insecure
        fallthrough in-addr.arpa ip6.arpa
    }

    # Forward internal domain to an internal DNS server
    forward home.local 192.168.1.1

    # Rewrite a hostname inside the cluster
    rewrite name myapp.old.cluster.local myapp.myapp.svc.cluster.local

    # Cache TTL
    cache 30

    # Stub zone — resolve a domain via a different DNS server
    import /etc/coredns/custom/*.server

    forward . /etc/resolv.conf
    log
    loop
    reload
    loadbalance
}
```

```bash
# Restart CoreDNS to pick up changes
kubectl rollout restart deployment coredns -n kube-system

# Debug DNS from inside a pod
kubectl run dnsutils --rm -it --restart=Never --image=registry.k8s.io/e2e-test-images/jessie-dnsutils:1.3 -- bash
# inside: nslookup kubernetes.default, dig myapp.myapp.svc.cluster.local
```

---

### ExternalDNS (Sync Ingress to DNS Provider)

**Purpose:** Automatically creates DNS records in Cloudflare, Route53, or your own DNS server when you create Ingress/Gateway/Service resources — no manual DNS management.

```bash
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm upgrade --install external-dns external-dns/external-dns \
  --namespace external-dns --create-namespace \
  -f ~/k8s/external-dns-values.yaml
```

```yaml
# ~/k8s/external-dns-values.yaml — Cloudflare provider
provider:
  name: cloudflare
env:
  - name: CF_API_TOKEN
    valueFrom:
      secretKeyRef:
        name: cloudflare-credentials
        key: api-token
txtOwnerId: homelab                  # unique ID to identify records this instance manages
domainFilters:
  - example.com
policy: sync                         # upsert-only (safer) or sync (also deletes stale records)
sources:
  - ingress
  - gateway-httproute                # Gateway API support
  - service
```

```bash
kubectl create secret generic cloudflare-credentials \
  --namespace external-dns \
  --from-literal=api-token=<your-token>

# Watch ExternalDNS process records
kubectl -n external-dns logs -l app.kubernetes.io/name=external-dns -f

# Annotate an Ingress to target a specific hostname
kubectl annotate ingress myapp \
  external-dns.alpha.kubernetes.io/hostname=myapp.example.com \
  external-dns.alpha.kubernetes.io/ttl=60
```

---

## NetworkPolicy — Default Deny Patterns

### Standard NetworkPolicy (L3/L4)

Cilium enforces these natively alongside `CiliumNetworkPolicy`.

```yaml
# Default deny all ingress for a namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
# Allow only same-namespace traffic + DNS egress (multi-tenant pattern)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-cross-namespace
  namespace: team-a
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - podSelector: {}
  egress:
    - to:
        - podSelector: {}
    - ports:
        - port: 53
          protocol: UDP
```

---

### MetalLB (Bare-Metal Load Balancer)

**Purpose:** LoadBalancer service support for bare-metal when Cilium's built-in LB IPAM is not sufficient (e.g. when BGP to a real router is needed).

```bash
helm repo add metallb https://metallb.github.io/metallb
helm install metallb metallb/metallb --namespace metallb-system --create-namespace
```

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: homelab-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.1.200-192.168.1.220
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: homelab-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - homelab-pool
```

> For simple homelab setups, Cilium's built-in `CiliumLoadBalancerIPPool` + `CiliumL2AnnouncementPolicy` replaces MetalLB entirely.

---

### Cilium LB IPAM + L2 Announcement (MetalLB Alternative)

**Purpose:** Cilium's built-in LoadBalancer IP pool — assigns external IPs from your LAN to `LoadBalancer` Services using Layer 2 ARP (like MetalLB L2 mode) or BGP. No additional component needed if you're already running Cilium.

```bash
# Ensure Cilium was installed with L2 announcements enabled
helm upgrade cilium cilium/cilium --namespace kube-system --reuse-values \
  --set l2announcements.enabled=true \
  --set externalIPs.enabled=true \
  --set k8sClientRateLimit.qps=50 \
  --set k8sClientRateLimit.burst=100
```

```yaml
# ~/k8s/cilium-lb-pool.yaml
apiVersion: cilium.io/v2alpha1
kind: CiliumLoadBalancerIPPool
metadata:
  name: homelab-pool
spec:
  cidrs:
    - cidr: 192.168.1.200/29   # 192.168.1.200–207 (8 IPs from your LAN)
  serviceSelector:              # optional: only assign to services with this label
    matchLabels:
      expose: external
---
apiVersion: cilium.io/v2alpha1
kind: CiliumL2AnnouncementPolicy
metadata:
  name: homelab-l2
spec:
  serviceSelector:
    matchLabels:
      expose: external
  nodeSelector:
    matchLabels:
      kubernetes.io/os: linux
  interfaces:
    - eth0              # your node's LAN interface
  externalIPs: true
  loadBalancerIPs: true
```

```bash
kubectl apply -f ~/k8s/cilium-lb-pool.yaml

# Any Service with expose=external label now gets a LAN IP
kubectl get svc -A | grep LoadBalancer

# Verify Cilium ARP announcements
kubectl exec -n kube-system ds/cilium -- cilium l2-responder list
```

> **Cilium BGP** (for peering with a router): enable `bgpControlPlane.enabled=true` in Cilium values and create a `CiliumBGPPeeringPolicy` CRD — better for environments with a proper BGP router (OPNsense, pfSense, a dedicated switch).

---

### Gateway API

The official successor to `Ingress`. Declarative, annotation-free routing. Supported by ingress-nginx, NGF, and Cilium.

```bash
# Standard channel
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/standard-install.yaml
# Experimental (adds TCPRoute, TLSRoute, etc.)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/experimental-install.yaml
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main
  namespace: default
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      port: 80
      protocol: HTTP
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: my-tls-secret
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp
  namespace: default
spec:
  parentRefs:
    - name: main
  hostnames:
    - "myapp.home.local"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: myapp
          port: 80
```

> Use Gateway API for all new workloads — it is the upstream direction. Ingress and Gateway API can coexist.

---

### ingress-nginx (Classic Ingress Controller)

**Purpose:** The most widely deployed Kubernetes ingress controller. Uses `Ingress` resources (the older API, still fully supported). If you're migrating an existing cluster or need compatibility with Helm charts that ship `Ingress` manifests, ingress-nginx is the practical choice. New deployments should prefer NGF + Gateway API.

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080 \
  --set controller.service.nodePorts.https=30443 \
  --set controller.allowSnippetAnnotations=true
```

```yaml
# Basic Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp
  namespace: myapp
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
spec:
  ingressClassName: nginx
  rules:
    - host: myapp.home.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp
                port:
                  number: 8080
  tls:
    - hosts:
        - myapp.home.local
      secretName: myapp-tls    # cert-manager populates this
```

```yaml
# Common useful annotations
nginx.ingress.kubernetes.io/ssl-redirect: "true"
nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
nginx.ingress.kubernetes.io/proxy-connect-timeout: "15"
nginx.ingress.kubernetes.io/rate-limit: "100"           # requests per second
nginx.ingress.kubernetes.io/rate-limit-burst-multiplier: "5"
nginx.ingress.kubernetes.io/auth-type: basic
nginx.ingress.kubernetes.io/auth-secret: basic-auth
nginx.ingress.kubernetes.io/whitelist-source-range: "192.168.1.0/24"
nginx.ingress.kubernetes.io/backend-protocol: "GRPC"    # gRPC backends
nginx.ingress.kubernetes.io/websocket-services: "myapp" # WebSocket support
cert-manager.io/cluster-issuer: letsencrypt-prod        # cert-manager integration
```

```bash
kubectl get ingressclass                          # confirm 'nginx' class exists
kubectl get ingress -A                            # list all Ingress resources
kubectl -n ingress-nginx logs -l app.kubernetes.io/name=ingress-nginx -f
kubectl -n ingress-nginx exec -it deploy/ingress-nginx-controller -- nginx -T  # dump NGINX config
```

> **NGF vs ingress-nginx:** NGF is annotation-free and uses Gateway API CRDs. ingress-nginx is annotation-heavy but has the largest ecosystem of Helm chart compatibility. Use ingress-nginx when your charts ship `Ingress` resources you can't modify.

---

**Purpose:** NGINX's Gateway API implementation. Built entirely on Gateway API CRDs — no annotations. On this system, Caddy terminates TLS on the host and forwards plain HTTP to NGF via NodePort.

#### Architecture

```
Browser → HTTPS → Caddy (host, port 443)
                   → HTTP → localhost:30080 (NodePort)
                              → NGF (GatewayClass: nginx)
                                  ├── HTTPRoute → app pods
                                  └── GRPCRoute → gRPC pods
```

#### Install

```bash
# Gateway API CRDs (v1.4.1 required by NGF v2.4.2)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml
kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/v2.4.2/deploy/crds.yaml

helm upgrade --install nginx-gateway-fabric \
  oci://ghcr.io/nginx/charts/nginx-gateway-fabric \
  --version 2.4.2 \
  --namespace nginx-gateway --create-namespace \
  -f ~/k8s/ngf-values.yaml --wait
```

```yaml
# ~/k8s/ngf-values.yaml
nginxGateway:
  gatewayClassName: nginx
  replicas: 1
  gwAPIExperimentalFeatures:
    enable: false   # GRPCRoute is GA — not needed
  resources:
    requests: { cpu: 200m, memory: 256Mi }
    limits: { cpu: 500m, memory: 512Mi }
nginx:
  replicas: 1
  autoscaling:
    enable: false
  container:
    resources:
      requests: { cpu: 200m, memory: 256Mi }
      limits: { cpu: 1000m, memory: 1Gi }
```

#### Expose via NodePort

```bash
kubectl -n nginx-gateway patch svc nginx-gateway-nginx \
  --type='json' \
  -p='[{"op":"replace","path":"/spec/type","value":"NodePort"},
       {"op":"add","path":"/spec/ports/0/nodePort","value":30080}]'

kubectl -n nginx-gateway get svc nginx-gateway-nginx   # PORT(S): 80:30080/TCP
```

#### Gateway and HTTPRoute

```yaml
# ~/k8s/ngf-gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: nginx-gateway
  namespace: nginx-gateway
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: All
```

```yaml
# ~/k8s/ngf-httproute-myapp.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-route
  namespace: nginx-gateway
spec:
  parentRefs:
    - name: nginx-gateway
      namespace: nginx-gateway
      sectionName: http
  hostnames:
    - myapp.home.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: myapp
          namespace: myapp-ns    # cross-namespace — needs ReferenceGrant
          port: 8080
```

```yaml
# ~/k8s/ngf-httproute-argocd.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: argocd-route
  namespace: nginx-gateway
spec:
  parentRefs:
    - name: nginx-gateway
      namespace: nginx-gateway
      sectionName: http
  hostnames:
    - argocd.home.local
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: argocd-server
          namespace: argocd
          port: 80
```

#### GRPCRoute

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GRPCRoute
metadata:
  name: order-svc-grpc
  namespace: nginx-gateway
spec:
  parentRefs:
    - name: nginx-gateway
      namespace: nginx-gateway
      sectionName: http
  hostnames:
    - order-service.internal.home.local
  rules:
    - matches:
        - method:
            type: Exact
            service: order.v1.OrderService
      backendRefs:
        - name: order-service
          namespace: services-ns
          port: 9090
```

#### ReferenceGrants (cross-namespace access)

```yaml
# Apply in EACH application namespace that NGF routes to
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-ngf-gateway
  namespace: myapp-ns
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: nginx-gateway
    - group: gateway.networking.k8s.io
      kind: GRPCRoute
      namespace: nginx-gateway
  to:
    - group: ""
      kind: Service
```

```bash
for ns in argocd myapp-ns services-ns; do
  kubectl apply -f ~/k8s/ngf-referencegrant.yaml -n $ns
done
```

#### NGF policy CRDs

| CRD | Purpose |
|-----|---------|
| `RateLimitPolicy` | Per-route rate limiting |
| `ClientSettingsPolicy` | Client→NGINX timeouts and body size |
| `ProxySettingsPolicy` | NGINX→backend proxy tuning |
| `ObservabilityPolicy` | OpenTelemetry tracing per route |
| `AuthenticationFilter` | Basic Auth per route |

```yaml
# Rate limit example
apiVersion: gateway.nginx.org/v1alpha1
kind: RateLimitPolicy
metadata:
  name: myapp-ratelimit
  namespace: nginx-gateway
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: myapp-route
  policy:
    rate: 100r/m
    burst: 20
    key: ${binary_remote_addr}
    zoneSize: 10m
    rejectCode: 429
```

#### NGF version compatibility

| NGF | Gateway API CRDs | Kubernetes |
|-----|-----------------|------------|
| v2.4.2 | v1.4.1 | 1.29–1.34 |
| v2.3.0 | v1.4.0 | 1.28–1.33 |

```bash
kubectl get gatewayclass nginx
kubectl -n nginx-gateway describe gateway nginx-gateway
kubectl get httproute -A
kubectl -n nginx-gateway logs -l app.kubernetes.io/name=nginx-gateway-fabric -f
kubectl -n nginx-gateway logs -l app.kubernetes.io/component=nginx -f

# Upgrade
helm upgrade nginx-gateway-fabric \
  oci://ghcr.io/nginx/charts/nginx-gateway-fabric \
  --version 2.4.3 --namespace nginx-gateway -f ~/k8s/ngf-values.yaml
```


---

## TLS & Certificate Management

### cert-manager (Automatic TLS)

```bash
helm repo add cert-manager https://charts.jetstack.io
helm upgrade --install cert-manager cert-manager/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

kubectl get pods -n cert-manager
```

#### ClusterIssuer — Let's Encrypt HTTP-01 (public domains)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

#### ClusterIssuer — Let's Encrypt DNS-01 via Cloudflare (wildcard certs)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-dns
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-dns-key
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token
              key: api-token
```

```bash
kubectl create secret generic cloudflare-api-token \
  --namespace cert-manager \
  --from-literal=api-token=<your-cloudflare-token>
```

#### ClusterIssuer — internal Step-CA (home.local)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: step-ca-internal
spec:
  acme:
    server: https://step-ca.home.local/acme/acme/directory
    email: admin@home.local
    privateKeySecretRef:
      name: step-ca-acme-key
    caBundle: <base64-encoded-step-ca-root-cert>
    solvers:
      - http01:
          ingress:
            class: nginx
```

```bash
kubectl get certificate -A
kubectl describe certificate myapp-tls -n myapp
```

### trust-manager (Distribute CA Bundles Cluster-Wide)

**Purpose:** cert-manager companion that distributes CA certificates and trust bundles as `ConfigMap` objects across namespaces. Solves the problem of apps needing to trust your internal CA (Step-CA, corporate CA) without baking certs into images.

```bash
helm upgrade --install trust-manager cert-manager/trust-manager \
  --namespace cert-manager --wait
```

```yaml
# ~/k8s/trust-bundle.yaml — distribute Step-CA root cert to all namespaces
apiVersion: trust.cert-manager.io/v1alpha1
kind: Bundle
metadata:
  name: homelab-ca-bundle
spec:
  sources:
    - secret:
        name: step-ca-root          # Secret in cert-manager namespace containing ca.crt
        key: ca.crt
    - useDefaultCAs: true           # also include system CAs
  target:
    configMap:
      key: ca-bundle.crt
    namespaceSelector:
      matchLabels:
        trust: enabled              # label namespaces that should receive the bundle
```

```bash
kubectl apply -f ~/k8s/trust-bundle.yaml

# Label a namespace to receive the bundle
kubectl label namespace myapp trust=enabled

# Verify it landed
kubectl get configmap homelab-ca-bundle -n myapp -o jsonpath='{.data.ca-bundle\.crt}' | head -5
```

```yaml
# Mount it in your app — now it trusts your internal CA
spec:
  containers:
    - name: myapp
      volumeMounts:
        - name: ca-bundle
          mountPath: /etc/ssl/certs/ca-bundle.crt
          subPath: ca-bundle.crt
  volumes:
    - name: ca-bundle
      configMap:
        name: homelab-ca-bundle
```

---

## Service Mesh

### Linkerd (Lightweight mTLS Service Mesh)

**Purpose:** CNCF-graduated ultra-lightweight service mesh. Adds automatic mTLS between services, per-route observability, retries, circuit breaking, and traffic shifting — no code changes required. Uses Rust micro-proxies (`linkerd-proxy`).

> **Cilium vs Linkerd:** Cilium provides eBPF-based L7 observability and WireGuard node-to-node encryption without sidecars. Linkerd adds **per-workload** SPIFFE identity and clean per-route retry budgets via `ServiceProfile`. Use Cilium for CNI + network policy + Hubble. Add Linkerd only when you specifically need per-route retry budgets, circuit breaking, or the `linkerd viz routes` golden metrics UX.

```bash
nix-env -iA nixpkgs.linkerd

linkerd check --pre
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -
linkerd check

linkerd viz install | kubectl apply -f -
linkerd viz check
linkerd viz dashboard &
```

#### Inject the mesh

```bash
kubectl annotate namespace myapp linkerd.io/inject=enabled
kubectl get deploy myapp -n myapp -o yaml | linkerd inject - | kubectl apply -f -

linkerd -n myapp check --proxy
linkerd viz stat deploy -n myapp
linkerd viz routes deploy/myapp -n myapp
linkerd viz tap deploy/myapp -n myapp
linkerd viz edges pod -n myapp     # verify mTLS on all connections
```

#### ServiceProfile — per-route retries and timeouts

```yaml
# ~/k8s/linkerd-serviceprofile.yaml
apiVersion: linkerd.io/v1alpha2
kind: ServiceProfile
metadata:
  name: myapp.myapp.svc.cluster.local
  namespace: myapp
spec:
  routes:
    - name: POST /api/orders
      condition:
        method: POST
        pathRegex: /api/orders
      responseClasses:
        - condition:
            status:
              min: 500
              max: 599
          isFailure: true
      retryBudget:
        retryRatio: 0.2
        minRetriesPerSecond: 10
        ttl: 10s
      timeout: 2000ms
```

```bash
kubectl apply -f ~/k8s/linkerd-serviceprofile.yaml
linkerd viz routes -n myapp svc/myapp
```

#### Traffic splitting (canary via SMI)

```yaml
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata:
  name: myapp-split
  namespace: myapp
spec:
  service: myapp
  backends:
    - service: myapp-stable
      weight: 90
    - service: myapp-canary
      weight: 10
```

**Caddy:** `linkerd.home.local { tls internal; reverse_proxy localhost:50750 }`

---

## Gateway API — Advanced Patterns

### Header-Based Routing & Traffic Mirroring

```yaml
# Route by header — canary for specific users
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-header-canary
  namespace: nginx-gateway
spec:
  parentRefs:
    - name: nginx-gateway
      sectionName: http
  hostnames: [myapp.home.local]
  rules:
    # Route beta users to canary (header: X-Beta: true)
    - matches:
        - headers:
            - name: X-Beta
              value: "true"
      backendRefs:
        - name: myapp-canary
          namespace: myapp-ns
          port: 8080

    # Everyone else gets stable
    - backendRefs:
        - name: myapp-stable
          namespace: myapp-ns
          port: 8080
---
# URL rewriting
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-rewrite
spec:
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api/v1
      filters:
        - type: URLRewrite
          urlRewrite:
            path:
              type: ReplacePrefixMatch
              replacePrefixMatch: /api
      backendRefs:
        - name: myapp
          port: 8080
---
# Traffic mirroring — send 100% to prod, copy to staging (dark launch)
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-mirror
spec:
  rules:
    - backendRefs:
        - name: myapp-prod
          port: 8080
      filters:
        - type: RequestMirror
          requestMirror:
            backendRef:
              name: myapp-staging
              port: 8080
```

---

## Network Troubleshooting

### netshoot (In-Cluster Network Debugging)

**Purpose:** `nicolaka/netshoot` is a comprehensive network troubleshooting container — it includes `curl`, `wget`, `dig`, `nslookup`, `tcpdump`, `ss`, `netstat`, `iperf3`, `traceroute`, `mtr`, `nmap`, and more. Use it as an ephemeral container or standalone pod.

```bash
# Attach to a running pod (ephemeral — no restart required)
kubectl debug -it <pod-name> -n myapp \
  --image=nicolaka/netshoot \
  --target=myapp

# Run as standalone pod in a namespace to test connectivity
kubectl run netshoot -n myapp --rm -it --restart=Never \
  --image=nicolaka/netshoot -- bash

# Inside netshoot:
curl -v http://backend-svc.myapp.svc.cluster.local:8080/health
dig backend-svc.myapp.svc.cluster.local
nslookup kubernetes.default.svc.cluster.local
tcpdump -i any -n port 8080
ss -tulnp
iperf3 -c backend-svc -p 5201 -t 10    # bandwidth test

# DNS resolution troubleshooting
dig @10.96.0.10 backend-svc.myapp.svc.cluster.local    # 10.96.0.10 = kube-dns ClusterIP
```

---

### Inspektor Gadget (eBPF-Based Cluster Debugging)

**Purpose:** Collection of eBPF-based tools for debugging networking, tracing, and security in Kubernetes — without modifying workloads. Built on Cilium's eBPF library. Runs as a DaemonSet; queried via `kubectl gadget`.

```bash
kubectl krew install gadget
kubectl gadget deploy

# Trace all DNS queries in a namespace
kubectl gadget trace dns -n myapp

# Watch all network connections being opened
kubectl gadget trace tcp -n myapp

# Trace syscalls for a specific pod
kubectl gadget trace exec -n myapp --podname myapp-xyz

# Detect privilege escalation attempts
kubectl gadget trace capabilities -n myapp

# Watch which files a pod opens
kubectl gadget trace open -n myapp --podname myapp-xyz

# Top processes by network usage
kubectl gadget top tcp -n myapp

# Profile CPU usage with stack traces
kubectl gadget profile cpu -n myapp --podname myapp-xyz --timeout 30
```

---

### Node Problem Detector

**Purpose:** Kubernetes DaemonSet that detects node-level problems (kernel panics, OOM events, disk pressure, NTP failures, container runtime crashes) and reports them as node conditions or events. Alerts fire via Prometheus.

```bash
helm repo add deliveryhero https://charts.deliveryhero.io/
helm install node-problem-detector deliveryhero/node-problem-detector \
  --namespace kube-system \
  --set metrics.enabled=true \
  --set metrics.serviceMonitor.enabled=true
```

```yaml
# PrometheusRule for node-problem-detector alerts
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: node-problem-alerts
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: node-problems
      rules:
        - alert: NodeKernelDeadlock
          expr: kube_node_status_condition{condition="KernelDeadlock",status="true"} == 1
          for: 5m
          labels: { severity: critical }
          annotations:
            summary: "Node {{ $labels.node }} has a kernel deadlock"

        - alert: NodeReadonlyFilesystem
          expr: kube_node_status_condition{condition="ReadonlyFilesystem",status="true"} == 1
          for: 5m
          labels: { severity: critical }
          annotations:
            summary: "Node {{ $labels.node }} filesystem is read-only"
```

---

