import { AppDataSource } from '../data-source';
import { AuditLog, AuditAction } from '../entities/AuditLog';
import type { User } from '../entities/User';

export async function logAudit(
  action: AuditAction,
  options: {
    actor?: User | null;
    entityType?: string;
    entityId?: string;
    details?: string;
  } = {},
): Promise<void> {
  try {
    const logRepo = AppDataSource.getRepository(AuditLog);
    await logRepo.save(logRepo.create({
      action,
      actor: options.actor ?? null,
      entityType: options.entityType ?? null,
      entityId: options.entityId ?? null,
      details: options.details ?? null,
    }));
  } catch (err) {
    console.error('[auditService] Failed to write audit log:', err);
  }
}
