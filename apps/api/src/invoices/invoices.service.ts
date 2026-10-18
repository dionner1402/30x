import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { detectInjectionSignals, fingerprint } from '@ezallow/domain';
import { extractFromFixture, listFixtureIds } from './fixture-extractor';
import { Invoice, InvoiceDocument } from './invoice.schema';

export type FromFixtureOpts = {
  /** Sufijo compartido por carga Demo Day → fingerprints frescos; N01+T-DUP siguen colisionando. */
  uniqueSuffix?: string;
};

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<InvoiceDocument>,
  ) {}

  listFixtures() {
    return { fixtures: listFixtureIds() };
  }

  async fromFixture(
    tenantId: string,
    fixtureId: string,
    opts: FromFixtureOpts = {},
  ) {
    if (!fixtureId?.trim()) {
      throw new BadRequestException('fixtureId is required');
    }
    let extracted;
    try {
      extracted = extractFromFixture(fixtureId.trim());
    } catch (e) {
      throw new NotFoundException((e as Error).message);
    }

    const invoice = { ...extracted.invoice, tenantId };
    const suffix = opts.uniqueSuffix?.trim();
    if (suffix) {
      // Sanitizar: solo alfanumérico + guión (evita romper normalizeInvoiceNumber)
      const safe = suffix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
      if (safe) {
        invoice.invoiceNumber = `${invoice.invoiceNumber}-${safe}`;
        invoice.fingerprint = fingerprint({
          tenantId,
          payeeName: invoice.payeeName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          currency: invoice.currency,
          issueDate: invoice.issueDate,
        });
      }
    }

    const doc = await this.invoices.create(invoice);

    return this.toDto(doc);
  }

  async list(tenantId: string) {
    const rows = await this.invoices
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return rows.map((r) => this.toDto(r));
  }

  async get(tenantId: string, id: string) {
    const row = await this.invoices.findOne({ _id: id, tenantId }).lean();
    if (!row) throw new NotFoundException('Invoice not found');
    return this.toDto(row);
  }

  async uploadMeta(
    tenantId: string,
    body: { note?: string },
  ) {
    // Upload binario real en stretch; boceto/API stub documentado.
    // Si hay note, ya se escanea por inyección (misma heurística que policy).
    const note = body.note ?? '';
    if (note.trim()) {
      const scan = detectInjectionSignals(note);
      if (!scan.clean) {
        throw new BadRequestException({
          error: 'untrusted_content_injection',
          message:
            'Upload rechazado: la nota contiene señales de inyección/redirect. Use fixtures limpios.',
          hits: scan.hits.map((h) => h.patternId),
        });
      }
    }
    throw new BadRequestException(
      `Upload stub: use POST /invoices/from-fixture. note=${note}`,
    );
  }

  private toDto(doc: Record<string, unknown> | InvoiceDocument) {
    const d = doc as Record<string, unknown> & {
      _id: { toString(): string };
      createdAt?: Date | string;
    };
    return {
      id: d._id.toString(),
      tenantId: d.tenantId,
      source: d.source,
      fixtureId: d.fixtureId,
      payeeName: d.payeeName,
      payeeNormalized: d.payeeNormalized,
      amount: d.amount,
      currency: d.currency,
      invoiceNumber: d.invoiceNumber,
      issueDate: d.issueDate,
      dueDate: d.dueDate,
      /** Cuándo entró a la bandeja (upload / fixture). */
      createdAt: d.createdAt
        ? new Date(d.createdAt as string | Date).toISOString()
        : undefined,
      lineItems: d.lineItems,
      tax: d.tax,
      agreedAmount: d.agreedAmount,
      fingerprint: d.fingerprint,
      mathOk: d.mathOk,
      status: d.status,
      tags: d.tags,
      paymentCategory: d.paymentCategory ?? 'suppliers',
      expectedOutcome: d.expectedOutcome,
      decisionHints: d.decisionHints,
    };
  }

  async setPaymentCategory(
    tenantId: string,
    id: string,
    paymentCategory: string,
  ) {
    const allowed = ['services', 'suppliers', 'payroll', 'ops', 'general'];
    if (!allowed.includes(paymentCategory)) {
      throw new BadRequestException(
        `paymentCategory must be one of: ${allowed.join(', ')}`,
      );
    }
    const row = await this.invoices.findOne({ _id: id, tenantId });
    if (!row) throw new NotFoundException('Invoice not found');
    if (row.status === 'decided') {
      throw new BadRequestException(
        'No se puede cambiar categoría de una factura ya decidida',
      );
    }
    row.paymentCategory = paymentCategory;
    await row.save();
    return this.toDto(row.toObject());
  }
}
