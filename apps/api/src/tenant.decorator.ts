import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const fromHeader = req.headers['x-tenant-id'];
    return (fromHeader || process.env.DEFAULT_TENANT_ID || 'blinka-demo').trim();
  },
);
