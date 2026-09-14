import { supabase } from './supabase';
import { DEFAULT_DEPARTMENTS } from '../types';

const LOCAL_STORAGE_KEY = 'francal_custom_departments';

export async function getDepartmentsForFilial(filial: string): Promise<string[]> {
  const normFilial = filial || '04';
  const baseDefaults = DEFAULT_DEPARTMENTS[normFilial] || DEFAULT_DEPARTMENTS['04'] || [];

  let dbDepartments: string[] = [];
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('name, filial')
      .eq('filial', normFilial)
      .order('name');

    if (!error && data && data.length > 0) {
      dbDepartments = data.map((d: any) => String(d.name).toUpperCase().trim());
    }
  } catch {
    // Ignora se tabela não existir ainda
  }

  // Carrega departamentos personalizados salvos localmente
  let localCustom: string[] = [];
  try {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${normFilial}`);
    if (saved) {
      localCustom = JSON.parse(saved).map((s: string) => s.toUpperCase().trim());
    }
  } catch {}

  // Também podemos coletar departamentos já usados em displays dessa filial
  let displayDepts: string[] = [];
  try {
    const { data } = await supabase
      .from('displays')
      .select('department, filial');
    
    if (data) {
      displayDepts = data
        .filter((d: any) => (d.filial || '04') === normFilial && d.department)
        .map((d: any) => String(d.department).toUpperCase().trim());
    }
  } catch {}

  const combined = Array.from(new Set([...baseDefaults, ...dbDepartments, ...localCustom, ...displayDepts]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return combined.length > 0 ? combined : baseDefaults;
}

export async function saveDepartmentForFilial(name: string, filial: string): Promise<string[]> {
  const normFilial = filial || '04';
  const cleanName = name.toUpperCase().trim();
  if (!cleanName) return getDepartmentsForFilial(normFilial);

  // Tentativa de gravar no Supabase
  try {
    await supabase
      .from('departments')
      .insert([{ name: cleanName, filial: normFilial }]);
  } catch (err) {
    console.warn("Aviso ao salvar departamento no banco:", err);
  }

  // Grava no localStorage para persistência imediata
  try {
    const key = `${LOCAL_STORAGE_KEY}_${normFilial}`;
    const saved = localStorage.getItem(key);
    const list: string[] = saved ? JSON.parse(saved) : [];
    if (!list.includes(cleanName)) {
      list.push(cleanName);
      localStorage.setItem(key, JSON.stringify(list));
    }
  } catch {}

  return getDepartmentsForFilial(normFilial);
}

export async function removeDepartmentForFilial(name: string, filial: string): Promise<string[]> {
  const normFilial = filial || '04';
  const cleanName = name.toUpperCase().trim();

  try {
    await supabase
      .from('departments')
      .delete()
      .eq('filial', normFilial)
      .eq('name', cleanName);
  } catch {}

  try {
    const key = `${LOCAL_STORAGE_KEY}_${normFilial}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const list: string[] = JSON.parse(saved);
      const filtered = list.filter(item => item.toUpperCase().trim() !== cleanName);
      localStorage.setItem(key, JSON.stringify(filtered));
    }
  } catch {}

  return getDepartmentsForFilial(normFilial);
}
