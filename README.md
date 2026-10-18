# EzAllow · Hackathon 30X × Blinka

**EzAllow** · clearance before money moves.  
Motor de política **fail-closed**, recibos verificables, suite adversaria. **No mueve dinero real** (mock rail OK).  
**Powered by [DG ARTECH Studio](https://dgartech.com).**

- **Track:** [Reto Blinka](https://hackradar.30x.com/recursos/blinka)
- **Demo:** https://dgartech.com/30x-EzAllow
- **Licencia:** [`LICENSE`](./LICENSE) · [`NOTICE`](./NOTICE)

**Pitch:** *delegar la decisión de pago sin delegar el control.*

La documentación interna (algoritmos, arquitectura, diferenciación, progreso, deploy, guiones) **no** forma parte de este repositorio público.

---

## Requisitos

- Node **≥ 20** + [pnpm](https://pnpm.io) 9  
- MongoDB: local (Docker) **o** Atlas  

---

## Setup

```bash
pnpm install
pnpm --filter @ezallow/shared build
pnpm --filter @ezallow/domain build
cp .env.example .env
# Editar .env: MONGODB_URI (+ proxy SOCKS si aplica)
```

### Terminal A — API `:3001`

```bash
pnpm --filter @ezallow/api dev
```

Health: [http://localhost:3001/health](http://localhost:3001/health) → `ok: true`, `mongo.readyState: 1`.

### Terminal B — Web `:3000`

```bash
pnpm --filter @ezallow/web dev
```

UI: [http://localhost:3000](http://localhost:3000)  
Proxy same-origin **`/backend`**. Tenant: `x-tenant-id: blinka-demo` (`NEXT_PUBLIC_TENANT_ID`).

O ambos: `pnpm dev` (turbo).

### Gates (API arriba)

```bash
pnpm e2e:demo    # Arco Demo Day
pnpm e2e:full    # E2E completo
pnpm eval:suite  # Suite adversaria · false_pay=0
pnpm test        # Unit tests
```

---

## Mongo

### Local (opcional)

```bash
docker compose up -d mongo
# En .env:
# MONGODB_URI=mongodb://127.0.0.1:27017/DBEZALLOW
# MONGODB_PROXY_HOST=   (vacío)
# MONGODB_PROXY_PORT=
```

### Atlas + SOCKS (si hace falta)

```bash
ssh -N -D 1080 <tu-jump-host>
```

```env
MONGODB_URI=<tu uri Atlas con /DBEZALLOW>
MONGODB_PROXY_HOST=127.0.0.1
MONGODB_PROXY_PORT=1080
```

Variables: [`.env.example`](./.env.example).

---

## Criterios de éxito

1. Autonomía en casos normales  
2. **Cero pagos indebidos** (`false_pay = 0`)  
3. Explicabilidad (recibo + counterfactual)  
4. Presupuesto (cash-aware) y/o analizador de política  

---

## Licencia

**Titular:** [DG ARTECH Studio](https://dgartech.com).

Repositorio **público** solo para evaluación del hackatón (30X × Blinka).  
**No es open source:** ver [`LICENSE`](./LICENSE) y [`NOTICE`](./NOTICE).

Uso en producción, forks comerciales o rebranding requiere permiso escrito de DG ARTECH Studio.

**Secretos:** este repo **no** incluye `.env` ni credenciales. Copia [`.env.example`](./.env.example) → `.env` en local.
