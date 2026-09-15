import React, { useState, useEffect } from 'react';
import { Users, Shield, User, Search, Loader2, AlertCircle, Trash2, Copy, Check, UserPlus, Key, Info, Edit3, X, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { Profile } from '../types';
import { 
  saveProfileToFirestore, 
  getProfilesFromFirestore, 
  deleteProfileFromFirestore, 
  subscribeProfilesFromFirestore 
} from '../lib/firebase';
import { normalizeFilial, INITIAL_STAFF_REGISTRY } from '../lib/staff';

interface UserManagementProps {
  currentUserFilial?: string;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUserFilial = '04' }) => {
  const [profiles, setProfiles] = useState<Profile[]>(INITIAL_STAFF_REGISTRY);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form states for NEW user
  const initialFilialNorm = normalizeFilial(currentUserFilial);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'vendedor' | 'admin'>('vendedor');
  const [newFilial, setNewFilial] = useState<string>(initialFilialNorm);
  const [filialFilter, setFilialFilter] = useState<string>('TODAS');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Modal states for EDIT and DELETE
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [userToEdit, setUserToEdit] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<'vendedor' | 'admin'>('vendedor');
  const [editFilial, setEditFilial] = useState<string>('04');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // In-app notifications
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const inviteLink = `${window.location.origin}?signup=true`;

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copySqlScript = () => {
    const sqlText = `-- 1. ADICIONAR COLUNAS NAS TABELAS
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS filial TEXT DEFAULT '04';
ALTER TABLE displays ADD COLUMN IF NOT EXISTS filial TEXT DEFAULT '04';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS filial TEXT DEFAULT '04';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS display_code TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS display_image TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS photo_status TEXT DEFAULT 'pending';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS photo_rejection_reason TEXT;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'ELMA CHIPS';
ALTER TABLE displays ADD COLUMN IF NOT EXISTS min_order_value NUMERIC DEFAULT 0;

-- 2. TABELA DE INDÚSTRIAS / DEPARTAMENTOS POR FILIAL
CREATE TABLE IF NOT EXISTS departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  filial TEXT NOT NULL DEFAULT '04',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. MIGRAR DADOS E DEFINIR ADMINS
UPDATE profiles SET filial = '04' WHERE filial IS NULL;
UPDATE displays SET filial = '04' WHERE filial IS NULL;
UPDATE requests SET filial = '04' WHERE filial IS NULL;
UPDATE displays SET department = 'ELMA CHIPS' WHERE department IS NULL;
UPDATE profiles SET role = 'admin' WHERE email ILIKE '%juda%';

-- 4. INSERIR INDÚSTRIAS BÁSICAS
INSERT INTO departments (name, filial) VALUES
  ('ELMA CHIPS', '04'),
  ('MONDELEZ', '04'),
  ('FELTRIN', '04'),
  ('CALÇADOS', '04'),
  ('AB MAURY', '04'),
  ('ELMA CHIPS', '02'),
  ('MONDELEZ', '02'),
  ('FELTRIN', '02'),
  ('BEBIDAS', '02'),
  ('DOCES', '02')
ON CONFLICT DO NOTHING;

-- 5. POLÍTICAS DE ACESSO TOTAL PARA TODOS OS USUÁRIOS (FRANCAL)
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('profiles', 'requests', 'displays', 'departments')) 
    LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename); END LOOP;
END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE displays ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "francal_authenticated_profiles" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_requests" ON requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_displays" ON displays FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_departments" ON departments FOR ALL TO authenticated USING (true) WITH CHECK (true);`;

    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const [copiedSql, setCopiedSql] = useState(false);

  // Registro em cache local para que nenhum admin perca visualização de cadastros
  const CACHE_KEY = 'francal_profiles_registry_v1';

  function getCachedProfiles(): Profile[] {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveProfilesToCache(list: Profile[]) {
    try {
      const current = getCachedProfiles();
      const map = new Map<string, Profile>();
      current.forEach(p => {
        const key = p.id || p.email?.toLowerCase();
        if (key) map.set(key, p);
      });
      list.forEach(p => {
        const key = p.id || p.email?.toLowerCase();
        if (key) map.set(key, p);
      });
      const merged = Array.from(map.values());
      localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
    } catch {}
  }

  function removeProfileFromCache(id: string, email?: string) {
    try {
      const current = getCachedProfiles().filter(p => p.id !== id && (!email || p.email?.toLowerCase() !== email.toLowerCase()));
      localStorage.setItem(CACHE_KEY, JSON.stringify(current));
    } catch {}
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    if (newPassword.length < 6) {
      setFeedback({ type: 'error', message: "A senha provisória deve ter pelo menos 6 caracteres." });
      return;
    }

    setIsCreatingUser(true);
    setFeedback(null);
    const selectedFilial = newFilial;
    const selectedRole = newRole;
    const cleanEmail = newEmail.trim().toLowerCase();

    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

      const tempClient = createClient(supabaseUrl, supabaseAnonKey, { 
        auth: { persistSession: false } 
      });

      // 1. Cria usuário com metadata explícita (permanece gravada na autenticação)
      const { data, error } = await tempClient.auth.signUp({
        email: cleanEmail,
        password: newPassword,
        options: {
          data: {
            role: selectedRole,
            filial: selectedFilial,
            email: cleanEmail
          }
        }
      });

      if (error) throw error;
      
      if (data.user) {
        const normFilial = normalizeFilial(selectedFilial);
        const newProfileData: Profile = {
          id: data.user.id,
          email: cleanEmail,
          role: selectedRole,
          filial: normFilial,
          created_at: new Date().toISOString()
        };

        // 2. Salva no Firestore (garantia de sincronização em nuvem compartilhada para todos os admins)
        await saveProfileToFirestore(newProfileData);

        // 3. Salva o perfil com a própria sessão do usuário recém-criado
        try {
          if (data.session) {
            await tempClient
              .from('profiles')
              .upsert([newProfileData], { onConflict: 'id' });
          } else {
            const { data: signInData } = await tempClient.auth.signInWithPassword({
              email: cleanEmail,
              password: newPassword
            });
            if (signInData?.session) {
              await tempClient
                .from('profiles')
                .upsert([newProfileData], { onConflict: 'id' });
            }
          }
        } catch (e) {
          console.warn("Aviso ao tentar salvar perfil com tempClient:", e);
        }

        // 4. Também tenta salvar via client do administrador logado
        try {
          await supabase
            .from('profiles')
            .upsert([newProfileData], { onConflict: 'id' });
        } catch {}

        // 5. Salva no cache local para redundância imediata
        saveProfilesToCache([newProfileData]);

        // 6. Atualiza estado imediatamente no formulário
        setProfiles(prev => {
          const map = new Map<string, Profile>();
          prev.forEach(p => map.set((p.email || p.id).toLowerCase().trim(), p));
          map.set(newProfileData.email.toLowerCase().trim(), newProfileData);
          return Array.from(map.values());
        });

        setFeedback({
          type: 'success',
          message: `Usuário ${cleanEmail} cadastrado com sucesso na FILIAL ${normFilial} como ${selectedRole.toUpperCase()}!`
        });
        setNewEmail('');
        setNewPassword('');
        setNewRole('vendedor');
        await fetchProfiles();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: "Erro ao cadastrar usuário: " + err.message });
    } finally {
      setIsCreatingUser(false);
    }
  };

  useEffect(() => {
    fetchProfiles();

    // Sincronização em tempo real via Firestore entre diferentes computadores e navegadores
    const unsubscribe = subscribeProfilesFromFirestore((cloudProfiles) => {
      if (cloudProfiles && cloudProfiles.length > 0) {
        setProfiles(prev => {
          const map = new Map<string, Profile>();
          prev.forEach(p => {
            const key = (p.email || p.id || '').toLowerCase().trim();
            if (key) map.set(key, { ...p, filial: normalizeFilial(p.filial) });
          });
          cloudProfiles.forEach(p => {
            const key = (p.email || p.id || '').toLowerCase().trim();
            if (key) {
              const existing = map.get(key);
              map.set(key, {
                ...existing,
                ...p,
                id: p.id || existing?.id || key,
                filial: normalizeFilial(p.filial || existing?.filial)
              });
            }
          });
          return Array.from(map.values());
        });
      }
    });

    return () => unsubscribe();
  }, []);

  async function fetchProfiles() {
    try {
      setLoading(true);
      setErrorState(null);

      // 1. Busca perfis gravados no Firestore
      const firestoreProfiles = await getProfilesFromFirestore();

      // 2. Busca perfis do Supabase
      let supabaseProfiles: Profile[] = [];
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*');
        if (!error && data) {
          supabaseProfiles = data;
        }
      } catch (sbErr) {
        console.warn("Aviso ao buscar perfis no Supabase:", sbErr);
      }

      // 3. Usuários a partir de solicitações já feitas no Supabase
      let requestUsers: Profile[] = [];
      try {
        const { data: reqData } = await supabase
          .from('requests')
          .select('user_id, user_email, filial')
          .not('user_email', 'is', null);
        if (reqData && reqData.length > 0) {
          const seen = new Set<string>();
          reqData.forEach((r: any) => {
            const clean = (r.user_email || '').toLowerCase().trim();
            if (clean && !seen.has(clean)) {
              seen.add(clean);
              requestUsers.push({
                id: r.user_id || `user-${clean}`,
                email: clean,
                role: 'vendedor',
                filial: normalizeFilial(r.filial),
                created_at: new Date().toISOString()
              });
            }
          });
        }
      } catch {}

      // 4. Cache local
      const cached = getCachedProfiles();

      // 5. Mescla todas as fontes com a lista inicial da Francal
      const map = new Map<string, Profile>();

      // Insere primeiro o registro base (incluindo deivid@francal.com, adriana@francal.com, juda@francal.com)
      INITIAL_STAFF_REGISTRY.forEach(p => {
        const key = p.email.toLowerCase().trim();
        map.set(key, { ...p, filial: normalizeFilial(p.filial) });
      });

      // Sobrescreve com dados do cache local
      cached.forEach(p => {
        const key = (p.email || p.id || '').toLowerCase().trim();
        if (key) {
          map.set(key, { ...p, filial: normalizeFilial(p.filial) });
        }
      });

      // Sobrescreve com usuários identificados em pedidos
      requestUsers.forEach(p => {
        const key = p.email.toLowerCase().trim();
        if (key && !map.has(key)) {
          map.set(key, { ...p, filial: normalizeFilial(p.filial) });
        }
      });

      // Sobrescreve com perfis vindos do Supabase
      supabaseProfiles.forEach(p => {
        const key = (p.email || p.id || '').toLowerCase().trim();
        if (key) {
          const existing = map.get(key);
          map.set(key, {
            ...existing,
            ...p,
            id: p.id || existing?.id || key,
            filial: normalizeFilial(p.filial || existing?.filial)
          });
        }
      });

      // Sobrescreve com perfis do Firestore (nuvem compartilhada)
      firestoreProfiles.forEach(p => {
        const key = (p.email || p.id || '').toLowerCase().trim();
        if (key) {
          const existing = map.get(key);
          map.set(key, {
            ...existing,
            ...p,
            id: p.id || existing?.id || key,
            filial: normalizeFilial(p.filial || existing?.filial)
          });
        }
      });

      const combined = Array.from(map.values());
      setProfiles(combined);
      saveProfilesToCache(combined);

      // Sincroniza em segundo plano para o Firestore qualquer perfil que ainda não esteja lá
      combined.forEach(p => {
        saveProfileToFirestore(p).catch(() => {});
      });

    } catch (err: any) {
      console.error("Erro ao carregar usuários:", err);
      setProfiles(INITIAL_STAFF_REGISTRY);
    } finally {
      setLoading(false);
    }
  }

  async function toggleFilial(id: string, currentFilial?: string) {
    if (updating) return;
    const currentNorm = normalizeFilial(currentFilial);
    const nextFilial = currentNorm === '04' ? '02' : '04';

    try {
      setUpdating(id);
      try {
        await supabase
          .from('profiles')
          .update({ filial: nextFilial })
          .eq('id', id);
      } catch {}

      const targetUser = profiles.find(p => p.id === id);
      if (targetUser) {
        await saveProfileToFirestore({ ...targetUser, filial: nextFilial });
      }

      setProfiles(prev => {
        const updated = prev.map(p => p.id === id ? { ...p, filial: nextFilial } : p);
        saveProfilesToCache(updated);
        return updated;
      });
      setFeedback({ type: 'success', message: `Filial alterada para FILIAL ${nextFilial}!` });
    } catch (err: any) {
      setFeedback({ type: 'error', message: "Erro ao alterar filial: " + err.message });
    } finally {
      setUpdating(null);
    }
  }

  async function toggleRole(id: string, currentRole: string) {
    if (updating) return;
    const newRole = currentRole === 'admin' ? 'vendedor' : 'admin';
    
    if (newRole === 'vendedor' && profiles.filter(p => p.role === 'admin').length <= 1) {
      setFeedback({ type: 'error', message: "Não é possível rebaixar o único administrador." });
      return;
    }

    try {
      setUpdating(id);
      try {
        await supabase
          .from('profiles')
          .update({ role: newRole })
          .eq('id', id);
      } catch {}

      const targetUser = profiles.find(p => p.id === id);
      if (targetUser) {
        await saveProfileToFirestore({ ...targetUser, role: newRole as any });
      }

      setProfiles(prev => {
        const updated = prev.map(p => p.id === id ? { ...p, role: newRole as any } : p);
        saveProfilesToCache(updated);
        return updated;
      });
      setFeedback({ type: 'success', message: `Cargo alterado para ${newRole.toUpperCase()}!` });
    } catch (err: any) {
      setFeedback({ type: 'error', message: "Erro ao atualizar cargo: " + err.message });
    } finally {
      setUpdating(null);
    }
  }

  function openEditModal(profile: Profile) {
    setUserToEdit(profile);
    setEditRole(profile.role);
    setEditFilial(normalizeFilial(profile.filial));
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!userToEdit) return;

    setIsSavingEdit(true);
    const normFilial = normalizeFilial(editFilial);
    try {
      try {
        await supabase
          .from('profiles')
          .update({
            role: editRole,
            filial: normFilial
          })
          .eq('id', userToEdit.id);
      } catch {}

      await saveProfileToFirestore({
        ...userToEdit,
        role: editRole,
        filial: normFilial
      });

      setProfiles(prev => {
        const updated = prev.map(p => 
          p.id === userToEdit.id ? { ...p, role: editRole, filial: normFilial } : p
        );
        saveProfilesToCache(updated);
        return updated;
      });

      setFeedback({
        type: 'success',
        message: `Usuário ${userToEdit.email} atualizado para FILIAL ${normFilial} e cargo ${editRole.toUpperCase()} com sucesso!`
      });
      setUserToEdit(null);
    } catch (err: any) {
      setFeedback({ type: 'error', message: "Erro ao salvar alterações: " + err.message });
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleConfirmDelete() {
    if (!userToDelete) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === userToDelete.id || user?.email?.toLowerCase() === userToDelete.email?.toLowerCase()) {
      setFeedback({ type: 'error', message: "Você não pode excluir sua própria conta de administrador." });
      setUserToDelete(null);
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Limpar solicitações vinculadas para não conflitar com foreign keys
      try {
        await supabase
          .from('requests')
          .delete()
          .eq('user_id', userToDelete.id);
      } catch (reqErr) {
        console.warn("Aviso ao deletar solicitações vinculadas:", reqErr);
      }

      // 2. Deletar da tabela profiles
      try {
        await supabase
          .from('profiles')
          .delete()
          .eq('id', userToDelete.id);
      } catch {}

      // 3. Deletar do Firestore
      if (userToDelete.email) {
        await deleteProfileFromFirestore(userToDelete.email);
      }

      removeProfileFromCache(userToDelete.id, userToDelete.email);
      setProfiles(prev => prev.filter(p => p.id !== userToDelete.id && p.email?.toLowerCase() !== userToDelete.email?.toLowerCase()));
      setFeedback({ 
        type: 'success', 
        message: `Usuário ${userToDelete.email || userToDelete.id} excluído com sucesso!` 
      });
      setUserToDelete(null);
    } catch (err: any) {
      console.error("Erro completo ao excluir:", err);
      setFeedback({ 
        type: 'error', 
        message: "Erro ao excluir usuário: " + (err.message || "Verifique permissões no banco Supabase.") 
      });
    } finally {
      setIsDeleting(false);
    }
  }

  const filtered = profiles.filter(p => {
    const q = filter.toLowerCase().trim();
    const email = (p.email || '').toLowerCase();
    const role = (p.role || '').toLowerCase();
    const matchesQuery = !q || email.includes(q) || role.includes(q);
    const userFilial = normalizeFilial(p.filial);
    const targetFilial = filialFilter === 'TODAS' ? 'TODAS' : normalizeFilial(filialFilter);
    const matchesFilial = targetFilial === 'TODAS' || userFilial === targetFilial;
    return matchesQuery && matchesFilial;
  });

  return (
    <div className="space-y-8">
      {/* Top Banner Alert / Feedback */}
      {feedback && (
        <div className={`p-4 border-2 flex items-center justify-between gap-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] ${
          feedback.type === 'success' 
            ? 'bg-green-100 border-green-700 text-green-950' 
            : 'bg-red-100 border-red-700 text-red-950'
        }`}>
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-700 shrink-0" />
            )}
            <p className="text-xs font-bold uppercase tracking-wider">{feedback.message}</p>
          </div>
          <button 
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Alerta de Sincronização de Banco (RLS) se detectar isolamento indevido */}
      {profiles.length <= 1 && !loading && (
        <div className="bg-amber-50 border-2 border-amber-600 p-5 shadow-[6px_6px_0px_0px_rgba(245,158,11,1)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-amber-950">
                Sincronização de Acessos para Administradores da Filial 02
              </p>
              <p className="text-[11px] font-medium text-amber-900 mt-1">
                Se você ou outro administrador da Filial 02 (como o Juda) estiver vendo apenas o próprio usuário ou sem acesso aos pedidos da equipe, basta copiar e executar o script SQL no seu painel Supabase.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={copySqlScript}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] uppercase tracking-widest shrink-0 transition-all flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:scale-95"
          >
            {copiedSql ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            {copiedSql ? 'Script Copiado!' : 'Copiar Script SQL'}
          </button>
        </div>
      )}

      {/* Header Section */}
      <div className="bg-[#141414] text-white p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,0.3)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter italic">Gestão de Equipe</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mt-1">Configuração de Vendedores, Filiais e Acessos</p>
        </div>
        
        <div className="bg-white/5 border border-white/10 p-4 rounded-lg flex flex-col gap-2 min-w-[300px]">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Link de Convite (Alternativo)</span>
          <div className="flex gap-2">
            <input 
              readOnly 
              value={inviteLink}
              className="bg-transparent border border-white/20 px-3 py-2 text-[10px] font-mono flex-1 outline-none truncate"
            />
            <button 
              onClick={copyInviteLink}
              className="bg-white text-[#141414] px-4 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-green-400 transition-all active:scale-95 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]"
            >
              {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copiado!' : 'Copiar Link'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Create User Form */}
        <div className="lg:col-span-1">
          <form 
            onSubmit={handleCreateUser}
            className="bg-white border-4 border-[#141414] p-6 shadow-[10px_10px_0px_0px_rgba(20,20,20,1)] sticky top-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-[#141414] p-3">
                <UserPlus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-black uppercase text-sm leading-tight tracking-tighter">Novo Usuário</h2>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/40">Cadastrar por Filial</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-[#141414]/60">E-mail</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
                  <input 
                    type="email" 
                    required
                    placeholder="usuario@empresa.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-[#141414] font-mono text-xs font-bold outline-none focus:bg-blue-50 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-[#141414]/60">Senha Provisória</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
                  <input 
                    type="password" 
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-[#141414] font-mono text-xs font-bold outline-none focus:bg-blue-50 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#141414]/60">Filial</label>
                  <select
                    value={newFilial}
                    onChange={e => setNewFilial(e.target.value)}
                    className="w-full border-2 border-[#141414] py-2.5 px-2 font-mono font-black text-xs uppercase bg-white outline-none"
                  >
                    <option value="04">FILIAL 04</option>
                    <option value="02">FILIAL 02</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#141414]/60">Cargo</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as any)}
                    className="w-full border-2 border-[#141414] py-2.5 px-2 font-mono font-black text-xs uppercase bg-white outline-none"
                  >
                    <option value="vendedor">VENDEDOR</option>
                    <option value="admin">ADMIN</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit"
                disabled={isCreatingUser}
                className="w-full bg-[#141414] text-white py-4 font-black uppercase text-[10px] tracking-[0.2em] hover:bg-white hover:text-[#141414] border-2 border-[#141414] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isCreatingUser ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                {isCreatingUser ? 'CADASTRANDO...' : 'CRIAR ACESSO'}
              </button>

              <div className="bg-gray-50 border border-[#141414]/10 p-3 flex gap-3 mt-4">
                <Info className="w-4 h-4 text-[#141414]/40 shrink-0" />
                <p className="text-[8px] font-medium text-[#141414]/40 uppercase leading-normal italic">
                  O usuário verá estritamente os expositores e pedidos da filial designada.
                </p>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: List and Filters */}
        <div className="lg:col-span-2 space-y-4">
          {/* Always-visible Search and Filial Filter Bar */}
          <div className="bg-white border-2 border-[#141414] p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
              <input 
                type="text" 
                placeholder="BUSCAR USUÁRIO..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border-2 border-[#141414] font-mono text-xs font-bold focus:bg-white outline-none"
              />
            </div>

            {/* Filial Filter */}
            <div className="flex items-center gap-1 border-2 border-[#141414] p-1 bg-white shrink-0">
              <span className="text-[8px] font-mono font-black uppercase text-[#141414]/40 px-1">Filial:</span>
              <button
                type="button"
                onClick={() => setFilialFilter('TODAS')}
                className={`px-3 py-1 font-mono text-[9px] font-black uppercase transition-all ${
                  filialFilter === 'TODAS' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-[#141414]/5'
                }`}
              >
                TODAS ({profiles.length})
              </button>
              <button
                type="button"
                onClick={() => setFilialFilter('04')}
                className={`px-3 py-1 font-mono text-[9px] font-black uppercase transition-all ${
                  filialFilter === '04' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-[#141414]/5'
                }`}
              >
                FILIAL 04 ({profiles.filter(p => normalizeFilial(p.filial) === '04').length})
              </button>
              <button
                type="button"
                onClick={() => setFilialFilter('02')}
                className={`px-3 py-1 font-mono text-[9px] font-black uppercase transition-all ${
                  filialFilter === '02' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-[#141414]/5'
                }`}
              >
                FILIAL 02 ({profiles.filter(p => normalizeFilial(p.filial) === '02').length})
              </button>
            </div>

            <button 
              type="button"
              onClick={fetchProfiles}
              className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shrink-0"
            >
              Atualizar
            </button>
          </div>

          {loading ? (
            <div className="bg-white border-2 border-[#141414] p-12 flex flex-col items-center justify-center gap-4 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
              <Loader2 className="w-8 h-8 animate-spin text-[#141414]" />
              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Carregando Usuários...</p>
            </div>
          ) : errorState ? (
            <div className="bg-red-50 border-2 border-red-600 p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col items-center gap-4 text-center">
              <AlertCircle className="w-12 h-12 text-red-600" />
              <div className="w-full">
                <h3 className="font-black text-red-600 uppercase tracking-tighter italic">Erro de Recursão no Supabase</h3>
                <p className="text-red-800 text-[10px] font-bold mt-2 uppercase">{errorState}</p>
              </div>
              <button 
                onClick={fetchProfiles}
                className="px-6 py-2 bg-red-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition-all mt-4"
              >
                Tentar Novamente
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-[#141414]/20 p-12 flex flex-col items-center justify-center text-center gap-4 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
              <AlertCircle className="w-12 h-12 text-[#141414]/20" />
              <div>
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-[#141414]/40">
                  Nenhum Usuário {filialFilter !== 'TODAS' ? `na Filial ${filialFilter}` : 'Encontrado'}
                </h3>
                <p className="text-[10px] font-medium text-[#141414]/40 mt-2 max-w-sm">
                  {filialFilter === '02' 
                    ? 'Ainda não há usuários cadastrados na Filial 02. Você pode cadastrar um novo usuário para a Filial 02 no formulário à esquerda.'
                    : 'Ajuste os filtros ou os termos da busca.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setFilialFilter('TODAS')}
                  className="px-4 py-2 border-2 border-[#141414] font-black uppercase text-[10px] tracking-widest hover:bg-[#141414] hover:text-white transition-all"
                >
                  Ver Todas as Filiais
                </button>
                <button
                  type="button"
                  onClick={() => setFilialFilter('04')}
                  className="px-4 py-2 bg-[#141414] text-white font-black uppercase text-[10px] tracking-widest hover:opacity-80 transition-all"
                >
                  Voltar para Filial 04
                </button>
              </div>
            </div>
          ) : (
            <section className="bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#141414] text-white text-left">
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest">Usuário</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest">Filial</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest">Cargo</th>
                      <th className="p-4 text-right text-[10px] font-black uppercase tracking-widest">Ações Rápidas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} className="border-b border-[#141414] hover:bg-gray-50 transition-colors">
                        <td className="p-4">
                          <p className="font-mono text-xs font-black truncate max-w-[200px]">{p.email || 'SEM E-MAIL'}</p>
                          <p className="text-[8px] font-bold text-[#141414]/40 uppercase">ID: {p.id}</p>
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => toggleFilial(p.id, p.filial)}
                            disabled={updating === p.id}
                            title="Clique para alternar rapidamente entre Filial 04 e Filial 02"
                            className={`font-mono text-[9px] font-black uppercase px-2.5 py-1 border-2 transition-all ${
                              normalizeFilial(p.filial) === '02'
                                ? 'bg-amber-100 text-amber-900 border-amber-500 hover:bg-amber-200'
                                : 'bg-purple-100 text-purple-900 border-purple-500 hover:bg-purple-200'
                            }`}
                          >
                            FILIAL {normalizeFilial(p.filial)} ⇄
                          </button>
                        </td>
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => toggleRole(p.id, p.role)}
                            disabled={updating === p.id}
                            title="Clique para alternar rapidamente o cargo"
                            className={`text-[8px] font-black uppercase px-2.5 py-1 tracking-widest border transition-all ${
                              p.role === 'admin' 
                                ? 'bg-red-600 text-white border-red-700 hover:bg-red-700' 
                                : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                            }`}
                          >
                            {p.role} ⇄
                          </button>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Edit Button */}
                            <button 
                              type="button"
                              onClick={() => openEditModal(p)}
                              disabled={updating === p.id}
                              className="px-2.5 py-1.5 border-2 border-[#141414] text-[9px] font-black uppercase hover:bg-[#141414] hover:text-white transition-all flex items-center gap-1"
                              title="Editar Filial e Cargo deste usuário"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span className="hidden sm:inline">Editar</span>
                            </button>

                            {/* Delete Button */}
                            <button 
                              type="button"
                              onClick={() => setUserToDelete(p)}
                              disabled={updating === p.id}
                              className="p-1.5 border-2 border-red-200 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all rounded-xs"
                              title="Excluir este usuário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* MODAL: EDITAR USUÁRIO */}
      {userToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border-4 border-[#141414] p-6 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[#141414] pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#141414]" />
                <h3 className="font-black uppercase text-sm tracking-tight">Editar Dados do Usuário</h3>
              </div>
              <button 
                onClick={() => setUserToEdit(null)}
                className="p-1 hover:bg-[#141414]/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-[10px] font-bold text-[#141414]/50 uppercase">Usuário Selecionado:</p>
              <p className="font-mono text-sm font-black text-[#141414] truncate">{userToEdit.email}</p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#141414]">
                  Filial de Atuação
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditFilial('04')}
                    className={`p-3 border-2 border-[#141414] font-mono text-xs font-black uppercase transition-all ${
                      editFilial === '04' ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]' : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    FILIAL 04
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditFilial('02')}
                    className={`p-3 border-2 border-[#141414] font-mono text-xs font-black uppercase transition-all ${
                      editFilial === '02' ? 'bg-amber-500 border-amber-600 text-white shadow-[2px_2px_0px_0px_rgba(245,158,11,0.4)]' : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    FILIAL 02
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-[#141414]">
                  Nível de Permissão (Cargo)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditRole('vendedor')}
                    className={`p-3 border-2 border-[#141414] font-mono text-xs font-black uppercase transition-all ${
                      editRole === 'vendedor' ? 'bg-blue-600 border-blue-700 text-white' : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    VENDEDOR
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditRole('admin')}
                    className={`p-3 border-2 border-[#141414] font-mono text-xs font-black uppercase transition-all ${
                      editRole === 'admin' ? 'bg-red-600 border-red-700 text-white' : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    ADMIN
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-[#141414]/10">
                <button
                  type="button"
                  onClick={() => setUserToEdit(null)}
                  className="flex-1 py-3 border-2 border-[#141414] font-black uppercase text-[10px] tracking-widest hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 py-3 bg-[#141414] text-white font-black uppercase text-[10px] tracking-widest hover:bg-green-600 border-2 border-[#141414] transition-all flex items-center justify-center gap-2"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR EXCLUSÃO (100% In-App, sem window.confirm bloqueável) */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border-4 border-red-600 p-6 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(220,38,38,0.3)] space-y-4">
            <div className="flex items-center gap-3 border-b-2 border-red-600 pb-3">
              <div className="bg-red-600 p-2 text-white">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black uppercase text-sm text-red-600 tracking-tight">Confirmar Exclusão de Usuário</h3>
                <p className="text-[9px] font-bold uppercase text-[#141414]/40">Ação irreversível</p>
              </div>
            </div>

            <div className="bg-red-50 p-3 border border-red-200">
              <p className="text-xs font-mono font-bold text-red-950 break-all">
                {userToDelete.email}
              </p>
              <div className="flex gap-2 mt-2">
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-red-200 text-red-900 uppercase">
                  Filial {userToDelete.filial || '04'}
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-red-200 text-red-900 uppercase">
                  {userToDelete.role.toUpperCase()}
                </span>
              </div>
            </div>

            <p className="text-xs text-[#141414]/70 leading-relaxed">
              Tem certeza que deseja excluir este usuário? Suas permissões de acesso e perfil serão removidos permanentemente.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-3 border-2 border-[#141414] font-black uppercase text-[10px] tracking-widest hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-3 bg-red-600 text-white font-black uppercase text-[10px] tracking-widest hover:bg-red-700 border-2 border-red-700 transition-all flex items-center justify-center gap-2"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Script Box */}
      <div className="bg-white border-4 border-red-600 p-6 space-y-4 shadow-[10px_10px_0px_0px_rgba(220,38,38,0.2)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-red-600 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-black uppercase tracking-tighter text-red-600">Banco de Dados: Comandos de Reparo e Liberação de Acesso</h4>
              <p className="text-[10px] font-bold uppercase text-red-600/60">Sincronização obrigatória de RLS e Filiais (Filial 04 e Filial 02)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={copySqlScript}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:scale-95 shrink-0"
          >
            {copiedSql ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            {copiedSql ? 'Script Copiado!' : 'Copiar Script SQL'}
          </button>
        </div>
        
        <p className="text-xs font-bold text-red-800 italic">
          ⚠️ Execute no SQL EDITOR do seu painel Supabase para liberar o acesso a todos os admins (incluindo Juda e novos usuários da Filial 02):
        </p>

        <div className="bg-[#141414] p-4 font-mono text-[10px] text-green-400 overflow-x-auto border-2 border-red-600">
          <pre>{`-- 1. ADICIONAR COLUNAS NAS TABELAS
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS filial TEXT DEFAULT '04';
ALTER TABLE displays ADD COLUMN IF NOT EXISTS filial TEXT DEFAULT '04';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS filial TEXT DEFAULT '04';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS display_code TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS display_image TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS photo_status TEXT DEFAULT 'pending';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS photo_rejection_reason TEXT;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'ELMA CHIPS';
ALTER TABLE displays ADD COLUMN IF NOT EXISTS min_order_value NUMERIC DEFAULT 0;

-- 2. TABELA DE INDÚSTRIAS / DEPARTAMENTOS POR FILIAL
CREATE TABLE IF NOT EXISTS departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  filial TEXT NOT NULL DEFAULT '04',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. MIGRAR DADOS E DEFINIR ADMINS
UPDATE profiles SET filial = '04' WHERE filial IS NULL;
UPDATE displays SET filial = '04' WHERE filial IS NULL;
UPDATE requests SET filial = '04' WHERE filial IS NULL;
UPDATE displays SET department = 'ELMA CHIPS' WHERE department IS NULL;
UPDATE profiles SET role = 'admin' WHERE email ILIKE '%juda%';

-- 4. INSERIR INDÚSTRIAS BÁSICAS
INSERT INTO departments (name, filial) VALUES
  ('ELMA CHIPS', '04'),
  ('MONDELEZ', '04'),
  ('FELTRIN', '04'),
  ('CALÇADOS', '04'),
  ('AB MAURY', '04'),
  ('ELMA CHIPS', '02'),
  ('MONDELEZ', '02'),
  ('FELTRIN', '02'),
  ('BEBIDAS', '02'),
  ('DOCES', '02')
ON CONFLICT DO NOTHING;

-- 5. POLÍTICAS DE ACESSO TOTAL PARA TODOS OS USUÁRIOS (FRANCAL)
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('profiles', 'requests', 'displays', 'departments')) 
    LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename); END LOOP;
END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE displays ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "francal_authenticated_profiles" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_requests" ON requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_displays" ON displays FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_departments" ON departments FOR ALL TO authenticated USING (true) WITH CHECK (true);`}
          </pre>
        </div>
        
        <div className="flex items-center gap-3 bg-red-50 p-3 border border-red-200">
          <Info className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-[10px] font-medium text-red-800 leading-normal">
            Esse comando ajusta os acessos da Filial 02 e Filial 04 de forma definitiva no Supabase.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
