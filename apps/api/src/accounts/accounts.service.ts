import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Account,
  AccountDocument,
  ACCOUNT_USAGES,
  type AccountUsage,
} from './account.schema';

const DEMO_ACCOUNTS: Array<{
  name: string;
  bank: string;
  usage: AccountUsage;
  priority: number;
  mockBalance: number;
}> = [
  {
    name: 'Operativa · servicios',
    bank: 'Banco A',
    usage: 'services',
    priority: 10,
    mockBalance: 25000,
  },
  {
    name: 'Proveedores',
    bank: 'Banco B',
    usage: 'suppliers',
    priority: 20,
    mockBalance: 80000,
  },
  {
    name: 'Nómina',
    bank: 'Banco C',
    usage: 'payroll',
    priority: 30,
    mockBalance: 45000,
  },
  {
    name: 'General / reserva',
    bank: 'Banco A',
    usage: 'general',
    priority: 90,
    mockBalance: 120000,
  },
];

@Injectable()
export class AccountsService {
  constructor(
    @InjectModel(Account.name) private readonly accounts: Model<AccountDocument>,
  ) {}

  /** Seed idempotente (upsert) — no duplica si el list se llama 2×. */
  async ensureDemo(tenantId: string) {
    for (const a of DEMO_ACCOUNTS) {
      await this.accounts.updateOne(
        { tenantId, bank: a.bank, name: a.name, usage: a.usage },
        {
          $setOnInsert: {
            ...a,
            tenantId,
            currency: 'USD',
            active: true,
          },
        },
        { upsert: true },
      );
    }
  }

  /** Quita duplicados históricos (mismo banco+alias+uso). */
  async dedupe(tenantId: string) {
    const rows = await this.accounts
      .find({ tenantId })
      .sort({ createdAt: 1 })
      .lean();
    const seen = new Set<string>();
    let removed = 0;
    for (const r of rows) {
      const key = `${r.bank}::${r.name}::${r.usage}`;
      if (seen.has(key)) {
        await this.accounts.deleteOne({ _id: r._id });
        removed += 1;
      } else {
        seen.add(key);
      }
    }
    return { removed };
  }

  async list(tenantId: string) {
    await this.ensureDemo(tenantId);
    await this.dedupe(tenantId);
    const rows = await this.accounts
      .find({ tenantId })
      .sort({ priority: 1, usage: 1, name: 1 })
      .lean();
    return rows.map((r) => this.toDto(r));
  }

  async create(
    tenantId: string,
    body: {
      name?: string;
      bank?: string;
      usage?: string;
      priority?: number;
      mockBalance?: number;
      currency?: string;
    },
  ) {
    const name = body.name?.trim();
    const bank = body.bank?.trim();
    const usage = body.usage as AccountUsage;
    if (!name || !bank) {
      throw new BadRequestException('name and bank are required');
    }
    if (!ACCOUNT_USAGES.includes(usage)) {
      throw new BadRequestException(
        `usage must be one of: ${ACCOUNT_USAGES.join(', ')}`,
      );
    }
    const doc = await this.accounts.create({
      tenantId,
      name,
      bank,
      usage,
      priority: Number.isFinite(body.priority) ? Number(body.priority) : 50,
      mockBalance: Number.isFinite(body.mockBalance)
        ? Number(body.mockBalance)
        : 0,
      currency: body.currency ?? 'USD',
      active: true,
    });
    return this.toDto(doc.toObject());
  }

  async patch(
    tenantId: string,
    id: string,
    body: {
      priority?: number;
      active?: boolean;
      mockBalance?: number;
      name?: string;
      usage?: string;
    },
  ) {
    const row = await this.accounts.findOne({ _id: id, tenantId });
    if (!row) throw new NotFoundException('Account not found');
    if (body.priority != null) row.priority = Number(body.priority);
    if (body.active != null) row.active = Boolean(body.active);
    if (body.mockBalance != null) row.mockBalance = Number(body.mockBalance);
    if (body.name?.trim()) row.name = body.name.trim();
    if (body.usage) {
      if (!ACCOUNT_USAGES.includes(body.usage as AccountUsage)) {
        throw new BadRequestException('invalid usage');
      }
      row.usage = body.usage as AccountUsage;
    }
    await row.save();
    return this.toDto(row.toObject());
  }

  /**
   * Elige cuenta de pago con saldo suficiente cuando se conoce el monto:
   * 1) usage preferido con balance ≥ amount (por prioridad)
   * 2) general con saldo
   * 3) cualquier activa con saldo
   * 4) si nadie cubre: preferido → general → primera (sobregiro demo)
   */
  async pickForPayment(
    tenantId: string,
    preferredUsage: AccountUsage = 'suppliers',
    amount?: number,
  ) {
    await this.ensureDemo(tenantId);
    const active = await this.accounts
      .find({ tenantId, active: true })
      .sort({ priority: 1 })
      .lean();
    if (!active.length) return null;

    const need = Number(amount);
    const mustCover = Number.isFinite(need) && need > 0;
    const canPay = (a: (typeof active)[number]) =>
      !mustCover || Number(a.mockBalance) >= need;

    const preferred = active.filter((a) => a.usage === preferredUsage);
    const general = active.filter((a) => a.usage === 'general');
    const others = active.filter(
      (a) => a.usage !== preferredUsage && a.usage !== 'general',
    );

    const funded =
      preferred.find(canPay) ??
      general.find(canPay) ??
      others.find(canPay) ??
      active.find(canPay);

    if (funded) {
      const preferredFirst = preferred[0];
      const switched =
        Boolean(preferredFirst) &&
        preferredFirst!._id.toString() !== funded._id.toString();
      return {
        ...this.toDto(funded),
        routing: {
          preferredUsage,
          matchedUsage: funded.usage === preferredUsage,
          balanceFallback: switched,
          covered: true,
          fromAccountId: preferredFirst
            ? preferredFirst._id.toString()
            : undefined,
          fromLabel: preferredFirst
            ? `${preferredFirst.bank} · ${preferredFirst.name}`
            : undefined,
        },
      };
    }

    // Nadie cubre el monto: seguir con routing clásico (permite saldo negativo en demo)
    const match =
      preferred[0] ?? general[0] ?? active[0];
    return {
      ...this.toDto(match),
      routing: {
        preferredUsage,
        matchedUsage: match.usage === preferredUsage,
        balanceFallback: false,
        covered: false,
      },
    };
  }

  /** Descuenta saldo mock al autorizar un PAY. */
  async debit(tenantId: string, accountId: string, amount: number) {
    const row = await this.accounts.findOne({ _id: accountId, tenantId });
    if (!row) throw new NotFoundException('Account not found');
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('amount inválido para debit');
    }
    row.mockBalance = Math.round((Number(row.mockBalance) - n) * 100) / 100;
    await row.save();
    return this.toDto(row.toObject());
  }

  /** Snapshot activo para lotes (evita N× find en pickForPayment). */
  async listActiveLean(tenantId: string) {
    await this.ensureDemo(tenantId);
    return this.accounts
      .find({ tenantId, active: true })
      .sort({ priority: 1 })
      .lean();
  }

  /**
   * Routing en memoria (mismo criterio que pickForPayment) + saldos del lote.
   */
  pickFromCached(
    active: Array<{
      _id: { toString(): string };
      bank: string;
      name: string;
      usage: string;
      priority: number;
      mockBalance: number;
    }>,
    balances: Map<string, number>,
    preferredUsage: AccountUsage = 'suppliers',
    amount?: number,
  ) {
    if (!active.length) return null;
    const need = Number(amount);
    const mustCover = Number.isFinite(need) && need > 0;
    const bal = (a: (typeof active)[number]) =>
      balances.get(a._id.toString()) ?? Number(a.mockBalance);
    const canPay = (a: (typeof active)[number]) =>
      !mustCover || bal(a) >= need;

    const preferred = active.filter((a) => a.usage === preferredUsage);
    const general = active.filter((a) => a.usage === 'general');
    const others = active.filter(
      (a) => a.usage !== preferredUsage && a.usage !== 'general',
    );

    const funded =
      preferred.find(canPay) ??
      general.find(canPay) ??
      others.find(canPay) ??
      active.find(canPay);

    if (funded) {
      const preferredFirst = preferred[0];
      const switched =
        Boolean(preferredFirst) &&
        preferredFirst!._id.toString() !== funded._id.toString();
      return {
        id: funded._id.toString(),
        bank: funded.bank,
        name: funded.name,
        usage: funded.usage as AccountUsage,
        priority: funded.priority,
        mockBalance: bal(funded),
        routing: {
          preferredUsage,
          matchedUsage: funded.usage === preferredUsage,
          balanceFallback: switched,
          covered: true,
          fromLabel: preferredFirst
            ? `${preferredFirst.bank} · ${preferredFirst.name}`
            : undefined,
        },
      };
    }

    const match = preferred[0] ?? general[0] ?? active[0];
    return {
      id: match._id.toString(),
      bank: match.bank,
      name: match.name,
      usage: match.usage as AccountUsage,
      priority: match.priority,
      mockBalance: bal(match),
      routing: {
        preferredUsage,
        matchedUsage: match.usage === preferredUsage,
        balanceFallback: false,
        covered: false,
      },
    };
  }

  /** Aplica débitos acumulados del lote (1 write por cuenta tocada). */
  async applyDebits(
    tenantId: string,
    debits: Array<{ accountId: string; amount: number }>,
  ) {
    if (!debits.length) return;
    const byAccount = new Map<string, number>();
    for (const d of debits) {
      const n = Number(d.amount);
      if (!Number.isFinite(n) || n <= 0) continue;
      byAccount.set(
        d.accountId,
        Math.round(((byAccount.get(d.accountId) ?? 0) + n) * 100) / 100,
      );
    }
    await Promise.all(
      [...byAccount.entries()].map(([accountId, total]) =>
        this.accounts.updateOne(
          { _id: accountId, tenantId },
          { $inc: { mockBalance: -total } },
        ),
      ),
    );
  }

  /** Restaura saldos demo (tras Limpiar demo). */
  async resetDemoBalances(tenantId: string) {
    await this.ensureDemo(tenantId);
    for (const a of DEMO_ACCOUNTS) {
      await this.accounts.updateOne(
        { tenantId, bank: a.bank, name: a.name, usage: a.usage },
        { $set: { mockBalance: a.mockBalance, active: true } },
      );
    }
  }

  /**
   * Categoría de la factura → uso de cuenta.
   * 1) paymentCategory explícito  2) tags de uso  3) heurística payee  4) suppliers
   */
  usageFromInvoice(input: {
    paymentCategory?: string;
    tags?: string[];
    fixtureId?: string;
    payeeName?: string;
  }): AccountUsage {
    const cat = input.paymentCategory?.toLowerCase();
    if (cat && ACCOUNT_USAGES.includes(cat as AccountUsage)) {
      return cat as AccountUsage;
    }
    const tags = (input.tags ?? []).map((t) => t.toLowerCase());
    for (const u of ACCOUNT_USAGES) {
      if (tags.includes(u)) return u;
    }
    const payee = (input.payeeName ?? '').toLowerCase();
    if (/nomina|payroll|salary/.test(payee)) return 'payroll';
    if (/cloud|aws|saas|media|signa|didit|dapta|macondo/.test(payee)) {
      return 'services';
    }
    if (/ops|utilities|rent|latam ops/.test(payee)) return 'ops';
    return 'suppliers';
  }

  private toDto(doc: Record<string, unknown> | AccountDocument) {
    const d = doc as Record<string, unknown> & {
      _id: { toString(): string };
    };
    return {
      id: d._id.toString(),
      tenantId: d.tenantId,
      name: d.name,
      bank: d.bank,
      usage: d.usage,
      priority: d.priority,
      currency: d.currency,
      active: d.active,
      mockBalance: d.mockBalance,
    };
  }
}
