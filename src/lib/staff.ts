import { Profile } from '../types';

/**
 * Normaliza representações de filial ('2' -> '02', '4' -> '04')
 */
export function normalizeFilial(filial?: string | null): '02' | '04' {
  if (!filial) return '04';
  const clean = String(filial).trim().toLowerCase();
  if (clean === '2' || clean === '02' || clean.includes('2')) return '02';
  return '04';
}

/**
 * Registro base de colaboradores Francal
 * Garante que usuários cadastrados nunca sumam da listagem, independente
 * do navegador ou sessão aberta.
 */
export const INITIAL_STAFF_REGISTRY: Profile[] = [
  {
    id: 'user-deivid-francal-02',
    email: 'deivid@francal.com',
    role: 'vendedor',
    filial: '02',
    created_at: '2026-03-01T00:00:00.000Z'
  },
  {
    id: 'user-adriana-francal-02',
    email: 'adriana@francal.com',
    role: 'vendedor',
    filial: '02',
    created_at: '2026-03-01T00:00:00.000Z'
  },
  {
    id: 'user-juda-francal-02',
    email: 'juda@francal.com',
    role: 'admin',
    filial: '02',
    created_at: '2026-03-01T00:00:00.000Z'
  },
  {
    id: 'user-daniel-francal-04',
    email: 'daniel@francal.com',
    role: 'admin',
    filial: '04',
    created_at: '2026-03-01T00:00:00.000Z'
  },
  {
    id: 'user-gabriel-admin',
    email: 'gabrielicloudgb@gmail.com',
    role: 'admin',
    filial: '04',
    created_at: '2026-03-01T00:00:00.000Z'
  },
  {
    id: 'user-default-admin',
    email: 'admin@gmail.com',
    role: 'admin',
    filial: '04',
    created_at: '2026-03-01T00:00:00.000Z'
  }
];
