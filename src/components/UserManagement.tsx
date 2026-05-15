import React, { useState, useEffect } from 'react';
import { Users, Shield, User, Search, Loader2, AlertCircle, Trash2, Link as LinkIcon, Copy, Check, UserPlus, Key, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { Profile } from '../types';

const UserManagement: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form states for NEW user
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const inviteLink = `${window.location.origin}?signup=true`;
  const isDevUrl = window.location.href.includes('ais-dev-');

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    if (newPassword.length < 6) {
      alert("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsCreatingUser(true);
    try {
      // Criamos um client temporário SEM persistência de sessão para não deslogar o Admin
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

      const tempClient = createClient(supabaseUrl, supabaseAnonKey, { 
        auth: { persistSession: false } 
      });

      const { data, error } = await tempClient.auth.signUp({
        email: newEmail,
        password: newPassword,
      });

      if (error) throw error;
      
      if (data.user) {
        // Agora forçamos a criação do perfil com role vendedor
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ 
            id: data.user.id, 
            email: newEmail, 
            role: 'vendedor' 
          }]);
        
        if (profileError) {
          console.warn("Usuário criado na Auth, mas erro no perfil:", profileError.message);
        }
        
        alert("USUÁRIO CADASTRADO COM SUCESSO!\n\nEle(a) já pode logar com este e-mail e senha.");
        setNewEmail('');
        setNewPassword('');
        fetchProfiles();
      }
    } catch (err: any) {
      alert("ERRO AO CADASTRAR: " + err.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    try {
      setLoading(true);
      setErrorState(null);
      const { data, error } = await supabase
        .from('profiles')
        .select('*');
      
      if (error) {
        console.error("DEBUG: Erro ao buscar perfis:", error);
        
        // Se falhou por RLS/Recursão, tenta pelo menos pegar o próprio perfil para não ficar vazio
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: ownProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
          if (ownProfile) {
            setProfiles([ownProfile]);
            return;
          }
        }
        
        throw new Error(error.message + " (Código: " + error.code + ")");
      }
      
      console.log("DEBUG: Perfis encontrados:", data?.length);
      setProfiles(data || []);
      
    } catch (err: any) {
      console.error("Error fetching profiles:", err);
      // Se for erro de recursão, mostramos a interface de reparo
      if (err.message?.includes('recursion')) {
        setErrorState(err.message);
      } else {
        alert("Erro ao carregar usuários: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleRole(id: string, currentRole: string) {
    if (updating) return;
    const newRole = currentRole === 'admin' ? 'vendedor' : 'admin';
    
    if (newRole === 'vendedor' && profiles.filter(p => p.role === 'admin').length <= 1) {
      alert("Não é possível remover o último administrador.");
      return;
    }

    try {
      setUpdating(id);
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', id);
      
      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, role: newRole as any } : p));
    } catch (err: any) {
      alert("Erro ao atualizar cargo: " + err.message);
    } finally {
      setUpdating(null);
    }
  }

  async function deleteProfile(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === id) {
      alert("Você não pode excluir seu próprio perfil de administrador.");
      return;
    }

    if (!confirm("Isso removerá as permissões e TODOS OS REGISTROS deste vendedor. Você tem certeza?")) return;

    try {
      setUpdating(id);
      
      // 1. Primeiro removemos as solicitações vinculadas para não dar erro de chave estrangeira
      const { error: reqError } = await supabase
        .from('requests')
        .delete()
        .eq('user_id', id);
      
      if (reqError) {
        console.error("Erro ao limpar solicitações:", reqError);
        throw new Error("Falha ao limpar registros de entrega: " + reqError.message);
      }

      // 2. Removemos o perfil
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      
      if (error) {
        console.error("Erro ao deletar perfil:", error);
        if (error.message.includes('foreign key')) {
          throw new Error("O usuário ainda possui registros vinculados em outras tabelas. Exclua-os manualmente no Supabase.");
        }
        throw error;
      }
      
      setProfiles(prev => prev.filter(p => p.id !== id));
      alert("USUÁRIO E SEUS DADOS EXCLUÍDOS COM SUCESSO!");
    } catch (err: any) {
      console.error("Erro completo ao excluir:", err);
      alert("ERRO CRÍTICO NA EXCLUSÃO:\n" + (err.message || "Verifique o console do navegador."));
    } finally {
      setUpdating(null);
    }
  }

  const filtered = profiles.filter(p => 
    p.email?.toLowerCase().includes(filter.toLowerCase()) || 
    p.role.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-[#141414] text-white p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,0.3)] flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter italic">Gestão de Equipe</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-50 mt-1">Configuração de Vendedores e Acessos</p>
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
                <h2 className="font-black uppercase text-sm leading-tight tracking-tighter">Novo Vendedor</h2>
                <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/40">Cadastrar manualmente</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-[#141414]/60">E-mail do Vendedor</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
                  <input 
                    type="email"
                    required
                    placeholder="vendedor@empresa.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border-2 border-[#141414] font-mono text-xs font-bold outline-none focus:bg-blue-50 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-[#141414]/60">Senha de Acesso</label>
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
                  O vendedor poderá logar imediatamente após você clicar em criar. Passa os dados para ele.
                </p>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: List and Filters */}
        <div className="lg:col-span-2 space-y-6">
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
                <div className="mt-6 bg-[#141414] text-green-400 p-4 font-mono text-[10px] text-left border-4 border-red-600">
                  <p className="text-white mb-2 font-black uppercase tracking-widest bg-red-600 inline-block px-2">Correção Final (Resolução de Loop):</p>
                  <p className="mb-4 text-white/50">O erro persiste porque as regras antigas ainda estão no banco. Rode este comando de limpeza ABSOLUTA:</p>
                  <pre className="whitespace-pre-wrap select-all">
{`-- 1. Destrava total das tabelas
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE requests DISABLE ROW LEVEL SECURITY;

-- 2. Limpeza total de políticas (Rode este bloco inteiro)
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('profiles', 'requests')) 
    LOOP EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename); END LOOP;
END $$;

-- 3. Correção do Erro de Constraint e Novas Colunas
ALTER TABLE requests ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE displays ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'ELMA CHIPS';
UPDATE displays SET department = 'ELMA CHIPS' WHERE department IS NULL;

ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check 
CHECK (status IN ('pending', 'approved', 'delivered', 'rejected'));

-- 4. Recriação das regras administrativas (SEM RECURSÃO)
-- ADM PROFILE: ACESSO TOTAL
CREATE POLICY "adm_master_profiles_v5" ON profiles FOR ALL 
USING (auth.jwt() ->> 'email' IN ('admin@gmail.com', 'gabrielicloudgb@gmail.com', 'daniel@francal.com'));

-- ADM REQUESTS: ACESSO TOTAL
CREATE POLICY "adm_master_requests_v5" ON requests FOR ALL 
USING (auth.jwt() ->> 'email' IN ('admin@gmail.com', 'gabrielicloudgb@gmail.com', 'daniel@francal.com'));

-- VENDEDORES: ACESSO RESTRITO
CREATE POLICY "vendedor_view_profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "vendedor_manage_requests" ON requests FOR ALL USING (auth.uid() = user_id);

-- 5. Reativação Manual (Importante rodar)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;`}
                  </pre>
                </div>
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
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-[#141414]/40">Nenhum Usuário Encontrado</h3>
                <p className="text-[10px] font-medium text-[#141414]/40 mt-2 max-w-xs">
                  Sincronize seu perfil se ele não aparecer aqui.
                </p>
              </div>
              <button 
                onClick={async () => {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  const isOwnerEmail = user.email === 'admin@gmail.com' || user.email === 'gabrielicloudgb@gmail.com' || user.email === 'daniel@francal.com';
                  try {
                    const { error } = await supabase.from('profiles').upsert({
                      id: user.id,
                      email: user.email,
                      role: isOwnerEmail ? 'admin' : 'vendedor'
                    }, { onConflict: 'id' });
                    if (error) throw error;
                    alert("Sincronizado!");
                    fetchProfiles();
                  } catch (err: any) {
                    alert("Erro: " + err.message);
                  }
                }}
                className="px-6 py-3 bg-[#141414] text-white text-[10px] font-black uppercase tracking-widest hover:bg-opacity-80 transition-all"
              >
                Sincronizar meu Perfil
              </button>
            </div>
          ) : (
            <section className="bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] overflow-hidden">
              <div className="p-4 border-b-2 border-[#141414] bg-gray-50 flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
                  <input 
                    type="text" 
                    placeholder="BUSCAR VENDEDOR..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border-2 border-[#141414] font-mono text-xs font-bold focus:bg-white outline-none"
                  />
                </div>
                <button 
                  onClick={fetchProfiles}
                  className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
                >
                  Atualizar
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#141414] text-white text-left">
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest">Usuário</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest">Cargo</th>
                      <th className="p-4 text-right text-[10px] font-black uppercase tracking-widest">Ações</th>
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
                          <span className={`text-[8px] font-black uppercase px-2 py-1 italic tracking-widest ${
                            p.role === 'admin' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                          }`}>
                            {p.role}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => toggleRole(p.id, p.role)}
                              disabled={updating === p.id}
                              className="px-3 py-1.5 border-2 border-[#141414] text-[9px] font-black uppercase hover:bg-[#141414] hover:text-white transition-all disabled:opacity-50"
                            >
                              {updating === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Cargo'}
                            </button>
                            <button 
                              onClick={() => deleteProfile(p.id)}
                              disabled={updating === p.id}
                              className="p-2 text-red-500 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
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

      <div className="bg-white border-2 border-dashed border-[#141414]/20 p-6 space-y-4">
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#141414]" />
            Sincronização de Dados
          </h4>
          <p className="text-xs font-medium text-[#141414]/50 leading-relaxed">
            Se algum usuário aparecer sem e-mail, ele ainda não completou o primeiro login. Se o problema persistir após o login, use o SQL Editor do Supabase para vincular os dados manualmente se necessário.
          </p>
        </div>

        <div>
          <h4 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Central de Ajuda
          </h4>
          <p className="text-xs font-medium text-[#141414]/50 leading-relaxed">
            A exclusão de um usuário nesta tela remove suas permissões de acesso ao sistema, mas o registro de autenticação permanece no Supabase Auth por segurança.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
