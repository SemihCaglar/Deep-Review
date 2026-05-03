import { IsNull } from 'typeorm';
import { AppDataSource } from '../data-source';
import { SystemPolicy, PolicyKey } from '../entities/SystemPolicy';

export async function getPolicyValue(key: PolicyKey, labId?: string): Promise<string | null> {
  const repo = AppDataSource.getRepository(SystemPolicy);
  if (labId) {
    const labPolicy = await repo.findOne({ where: { key, lab: { id: labId } } });
    if (labPolicy) return labPolicy.value;
  }
  const globalPolicy = await repo.findOne({ where: { key, lab: IsNull() as any } });
  return globalPolicy?.value ?? null;
}

export async function getPolicyNumber(key: PolicyKey, fallback: number, labId?: string): Promise<number> {
  const value = await getPolicyValue(key, labId);
  if (value === null) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}
