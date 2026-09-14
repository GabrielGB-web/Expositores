import { supabase } from './supabase';
import { DEFAULT_DEPARTMENTS } from '../types';

const LOCAL_STORAGE_KEY = 'francal_custom_departments';
const DELETED_STORAGE_KEY = 'francal_deleted_departments';

function getDeletedDepartments(filial: string): string[] {
  try {
    const saved = localStorage.getItem(`${DELETED_STORAGE_KEY}_${filial}`);
    return saved ? JSON.parse(saved).map((s: string) => s.toUpperCase().trim()) : [];
  } catch {
    return [];
  }
}

function saveDeletedDepartments(filial: string, list: string[]): void {
  try {
    localStorage.setItem(`${DELETED_STORAGE_KEY}_${filial}`, JSON.stringify(list));
  } catch {}
}

export async function getDepartmentsForFilial(filial: string): Promise<string[]> {
  const normFilial = filial || '04';
  const baseDefaults = DEFAULT_DEPARTMENTS[normFilial] || DEFAULT_DEPARTMENTS['04'] || [];
  const deletedSet = new Set(getDeletedDepartments(normFilial));

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

  // Combina todas as fontes
  const combined = Array.from(new Set([...baseDefaults, ...dbDepartments, ...localCustom]))
    .filter(Boolean)
    .filter(name => !deletedSet.has(name)) // Não inclui indústrias explicitamente removidas
    .sort((a, b) => a.localeCompare(b));

  return combined;
}

export async function saveDepartmentForFilial(name: string, filial: string): Promise<string[]> {
  const normFilial = filial || '04';
  const cleanName = name.toUpperCase().trim();
  if (!cleanName) return getDepartmentsForFilial(normFilial);

  // Se estava na lista de excluídos, remove da lista de excluídos
  const deleted = getDeletedDepartments(normFilial);
  if (deleted.includes(cleanName)) {
    saveDeletedDepartments(normFilial, deleted.filter(d => d !== cleanName));
  }

  // Grava no Supabase
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

  // 1. Marca como excluído para que não volte a ser injetado por baseDefaults
  const deleted = getDeletedDepartments(normFilial);
  if (!deleted.includes(cleanName)) {
    deleted.push(cleanName);
    saveDeletedDepartments(normFilial, deleted);
  }

  // 2. Remove do Supabase
  try {
    await supabase
      .from('departments')
      .delete()
      .eq('filial', normFilial)
      .eq('name', cleanName);
  } catch (err) {
    console.warn("Aviso ao excluir departamento no banco:", err);
  }

  // 3. Remove do localStorage
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
