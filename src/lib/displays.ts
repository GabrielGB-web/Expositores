import { supabase } from './supabase';
import { Display } from '../types';
import { 
  saveDisplayToFirestore, 
  getDisplaysFromFirestore, 
  deleteDisplayFromFirestore 
} from './firebase';
import { normalizeFilial } from './staff';

const CACHE_KEY = 'francal_displays_cache';

// SQL para liberação definitiva de RLS no Supabase para a tabela displays
export const SUPABASE_RLS_FIX_SQL = `-- CORREÇÃO DEFINITIVA DE PERMISSÕES (RLS) - TABELA DISPLAYS
-- Execute este comando no SQL Editor do seu painel Supabase

-- 1. Garante que as colunas necessárias existem
ALTER TABLE displays ADD COLUMN IF NOT EXISTS filial TEXT DEFAULT '04';
ALTER TABLE displays ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'ELMA CHIPS';
ALTER TABLE displays ADD COLUMN IF NOT EXISTS min_order_value NUMERIC DEFAULT 0;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS code TEXT;

-- 2. Habilita RLS
ALTER TABLE displays ENABLE ROW LEVEL SECURITY;

-- 3. Remove políticas antigas restritivas
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN (SELECT policyname FROM pg_policies WHERE tablename = 'displays') 
    LOOP 
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON displays'; 
    END LOOP;
END $$;

-- 4. Cria política unificada aberta para todas as operações (Filial 04 e Filial 02)
CREATE POLICY "francal_displays_unrestricted" 
ON displays 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);
`;

/**
 * Lê cache local de expositores
 */
export function getDisplaysFromCache(): Display[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Salva expositores no cache local
 */
export function saveDisplaysToCache(displays: Display[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(displays));
  } catch (err) {
    console.warn("Falha ao salvar cache de expositores:", err);
  }
}

/**
 * Mescla listas de expositores sem duplicar
 */
export function mergeDisplaysLists(...lists: Display[][]): Display[] {
  const map = new Map<string, Display>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const d of list) {
      if (!d || !d.name) continue;
      // Chave única: se tiver ID usa ID, senão combina código/nome com filial
      const filial = normalizeFilial(d.filial);
      const codeOrName = (d.code || d.name).trim().toLowerCase();
      const uniqueKey = d.id ? `id_${d.id}` : `key_${codeOrName}_${filial}`;
      
      const existing = map.get(uniqueKey);
      if (!existing) {
        map.set(uniqueKey, { ...d, filial });
      } else {
        // Mantém dados mais completos
        map.set(uniqueKey, {
          ...existing,
          ...d,
          filial,
          stock: typeof d.stock === 'number' ? d.stock : existing.stock,
          image_url: d.image_url || existing.image_url
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * Busca unificada de expositores (Supabase + Firestore + Cache Local)
 */
export async function fetchUnifiedDisplays(): Promise<Display[]> {
  let supabaseList: Display[] = [];
  let firestoreList: Display[] = [];
  const cachedList = getDisplaysFromCache();

  // 1. Tenta buscar do Supabase
  try {
    const { data, error } = await supabase
      .from('displays')
      .select('*')
      .order('name');
    
    if (!error && data) {
      supabaseList = data.map((d: any) => ({
        id: String(d.id),
        name: d.name,
        code: d.code || '',
        stock: Number(d.stock) || 0,
        department: d.department || 'ELMA CHIPS',
        min_order_value: Number(d.min_order_value) || 0,
        filial: normalizeFilial(d.filial),
        image_url: d.image_url || ''
      }));
    } else if (error) {
      console.warn("Supabase: Erro ao listar displays:", error.message);
    }
  } catch (err) {
    console.warn("Supabase indisponível para displays:", err);
  }

  // 2. Tenta buscar do Firestore
  try {
    firestoreList = await getDisplaysFromFirestore();
  } catch (err) {
    console.warn("Firestore indisponível para displays:", err);
  }

  // 3. Mescla tudo garantindo persistência sem perda
  const merged = mergeDisplaysLists(cachedList, firestoreList, supabaseList);
  saveDisplaysToCache(merged);
  return merged;
}

export interface SaveDisplayResult {
  success: boolean;
  savedInSupabase: boolean;
  savedInFirestore: boolean;
  supabaseRlsBlocked: boolean;
  errorMessage?: string;
  display: Display;
}

/**
 * Salva expositor de forma resiliente
 * (Grava no Supabase e no Firestore. Se o Supabase bloquear por RLS, o Firestore garante a gravação)
 */
export async function saveUnifiedDisplay(
  displayData: Omit<Display, 'id'> & { id?: string },
  isEdit: boolean,
  editId?: string
): Promise<SaveDisplayResult> {
  const finalFilial = normalizeFilial(displayData.filial);
  const targetId = editId || displayData.id || `disp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const completeDisplay: Display = {
    id: targetId,
    name: displayData.name,
    code: displayData.code || '',
    stock: Number(displayData.stock) || 0,
    department: displayData.department || 'ELMA CHIPS',
    min_order_value: Number(displayData.min_order_value) || 0,
    filial: finalFilial,
    image_url: displayData.image_url
  };

  let savedInSupabase = false;
  let supabaseRlsBlocked = false;
  let supabaseErrorMsg: string | undefined;

  // 1. Tenta gravar no Supabase
  try {
    if (isEdit && editId) {
      const { error: updateErr } = await supabase
        .from('displays')
        .update({
          name: completeDisplay.name,
          code: completeDisplay.code,
          stock: completeDisplay.stock,
          department: completeDisplay.department,
          min_order_value: completeDisplay.min_order_value,
          filial: completeDisplay.filial,
          image_url: completeDisplay.image_url
        })
        .eq('id', editId);

      if (updateErr) {
        throw updateErr;
      }
      savedInSupabase = true;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('displays')
        .insert([{
          name: completeDisplay.name,
          code: completeDisplay.code,
          stock: completeDisplay.stock,
          department: completeDisplay.department,
          min_order_value: completeDisplay.min_order_value,
          filial: completeDisplay.filial,
          image_url: completeDisplay.image_url
        }])
        .select();

      if (insertErr) {
        throw insertErr;
      }
      if (inserted && inserted[0]?.id) {
        completeDisplay.id = String(inserted[0].id);
      }
      savedInSupabase = true;
    }
  } catch (err: any) {
    console.error("Aviso Supabase ao salvar display:", err);
    supabaseErrorMsg = err?.message || String(err);
    if (
      supabaseErrorMsg?.toLowerCase().includes('row-level security') ||
      supabaseErrorMsg?.toLowerCase().includes('violates row-level security policy') ||
      supabaseErrorMsg?.toLowerCase().includes('permission denied')
    ) {
      supabaseRlsBlocked = true;
    }
  }

  // 2. Grava no Firestore (garantia em nuvem)
  let savedInFirestore = false;
  try {
    await saveDisplayToFirestore(completeDisplay);
    savedInFirestore = true;
  } catch (err) {
    console.warn("Falha ao sincronizar display no Firestore:", err);
  }

  // 3. Atualiza cache local
  const currentCache = getDisplaysFromCache();
  const updatedCache = isEdit 
    ? currentCache.map(d => d.id === targetId ? completeDisplay : d)
    : [...currentCache.filter(d => d.id !== targetId), completeDisplay];
  saveDisplaysToCache(updatedCache);

  // Se salvou no Firestore ou no Supabase, a operação foi bem-sucedida
  const success = savedInSupabase || savedInFirestore;

  return {
    success,
    savedInSupabase,
    savedInFirestore,
    supabaseRlsBlocked,
    errorMessage: supabaseErrorMsg,
    display: completeDisplay
  };
}

/**
 * Remove expositor de forma unificada
 */
export async function deleteUnifiedDisplay(id: string): Promise<void> {
  // 1. Tenta deletar no Supabase
  try {
    await supabase.from('displays').delete().eq('id', id);
  } catch (err) {
    console.warn("Aviso ao deletar display no Supabase:", err);
  }

  // 2. Deleta no Firestore
  try {
    await deleteDisplayFromFirestore(id);
  } catch (err) {
    console.warn("Aviso ao deletar display no Firestore:", err);
  }

  // 3. Deleta do cache
  const cached = getDisplaysFromCache();
  saveDisplaysToCache(cached.filter(d => d.id !== id));
}
