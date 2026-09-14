import React, { useState, useEffect } from 'react';
import { Users, Shield, User, Search, Loader2, AlertCircle, Trash2, Copy, Check, UserPlus, Key, Info, Edit3, X, CheckCircle2 } from 'lucide-react';
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
  const [newRole, setNewRole] = useState<'vendedor' | 'admin'>('vendedor');
  const [newFilial, setNewFilial] = useState<string>('04');
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    if (newPassword.length < 6) {
      setFeedback({ type: 'error', message: "A senha provisória deve ter pelo menos 6 caracteres." });
      return;
    }

    setIsCreatingUser(true);
    setFeedback(null);
    try {
      // Criamos um client temporário SEM persistência de sessão para não deslogar o Admin
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

      const tempClient = createClient(supabaseUrl, supabaseAnonKey, { 
        auth: { persistSession: false } 
      });

      const cleanEmail = newEmail.trim().toLowerCase();

      const { data, error } = await tempClient.auth.signUp({
        email: cleanEmail,
        password: newPassword,
      });

      if (error) throw error;
      
      if (data.user) {
        // Criamos ou atualizamos o perfil com role e filial selecionados
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([{ 
            id: data.user.id, 
            email: cleanEmail, 
            role: newRole,
            filial: newFilial
          }], { onConflict: 'id' });
        
        if (profileError) {
          console.warn("Usuário criado na Auth, mas erro no perfil:", profileError.message);
        }
        
        setFeedback({
          type: 'success',
          message: `Usuário ${cleanEmail} cadastrado com sucesso na FILIAL ${newFilial} como ${newRole.toUpperCase()}!`
        });
        setNewEmail('');
        setNewPassword('');
        setNewRole('vendedor');
        setNewFilial('04');
        fetchProfiles();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: "Erro ao cadastrar usuário: " + err.message });
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
      
      setProfiles(data || []);
    } catch (err: any) {
      console.error("Error fetching profiles:", err);
      if (err.message?.includes('recursion')) {
        setErrorState(err.message);
      } else {
        setFeedback({ type: 'error', message: "Erro ao carregar usuários: " + err.message });
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleFilial(id: string, currentFilial?: string) {
    if (updating) return;
    const current = currentFilial || '04';
    const nextFilial = current === '04' ? '02' : '04';

    try {
      setUpdating(id);
      const { error } = await supabase
        .from('profiles')
        .update({ filial: nextFilial })
        .eq('id', id);

      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, filial: nextFilial } : p));
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
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', id);
      
      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, role: newRole as any } : p));
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
    setEditFilial(profile.filial || '04');
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!userToEdit) return;

    setIsSavingEdit(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role: editRole,
          filial: editFilial
        })
        .eq('id', userToEdit.id);

      if (error) throw error;

      setProfiles(prev => prev.map(p => 
        p.id === userToEdit.id ? { ...p, role: editRole, filial: editFilial } : p
      ));

      setFeedback({
        type: 'success',
        message: `Usuário ${userToEdit.email} atualizado para FILIAL ${editFilial} e cargo ${editRole.toUpperCase()} com sucesso!`
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
    if (user?.id === userToDelete.id) {
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
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userToDelete.id);

      if (error) {
        console.error("Erro ao deletar perfil:", error);
        throw error;
      }

      setProfiles(prev => prev.filter(p => p.id !== userToDelete.id));
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
    const matchesQuery = p.email?.toLowerCase().includes(filter.toLowerCase()) || 
      p.role.toLowerCase().includes(filter.toLowerCase());
    const userFilial = p.filial || '04';
    const matchesFilial = filialFilter === 'TODAS' || userFilial === filialFilter;
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
                FILIAL 04 ({profiles.filter(p => (p.filial || '04') === '04').length})
              </button>
              <button
                type="button"
                onClick={() => setFilialFilter('02')}
                className={`px-3 py-1 font-mono text-[9px] font-black uppercase transition-all ${
                  filialFilter === '02' ? 'bg-[#141414] text-white' : 'text-[#141414] hover:bg-[#141414]/5'
                }`}
              >
                FILIAL 02 ({profiles.filter(p => (p.filial || '04') === '02').length})
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
                              (p.filial || '04') === '02'
                                ? 'bg-amber-100 text-amber-900 border-amber-500 hover:bg-amber-200'
                                : 'bg-purple-100 text-purple-900 border-purple-500 hover:bg-purple-200'
                            }`}
                          >
                            FILIAL {p.filial || '04'} ⇄
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
        <div className="flex items-center gap-3 border-b-2 border-red-600 pb-4">
          <div className="bg-red-600 p-2">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-tighter text-red-600">Banco de Dados: Comandos de Reparo (Multi-Filial & Estrutura)</h4>
            <p className="text-[10px] font-bold uppercase text-red-600/60">Sincronização obrigatória de estrutura para Filial 04 e Filial 02</p>
          </div>
        </div>
        
        <p className="text-xs font-bold text-red-800 italic">
          ⚠️ Execute no SQL EDITOR do seu painel Supabase para criar as colunas de filial e isolamento:
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

-- 3. MIGRAR DADOS EXISTENTES PARA FILIAL 04 (PADRÃO)
UPDATE profiles SET filial = '04' WHERE filial IS NULL;
UPDATE displays SET filial = '04' WHERE filial IS NULL;
UPDATE requests SET filial = '04' WHERE filial IS NULL;
UPDATE displays SET department = 'ELMA CHIPS' WHERE department IS NULL;

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

-- 5. POLÍTICAS DE ACESSO TOTAL PARA USUÁRIOS DO SISTEMA
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

-- Garante acesso a todos os administradores cadastrados (inclusive novos admins como Juda):
CREATE POLICY "francal_authenticated_profiles" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_requests" ON requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_displays" ON displays FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "francal_authenticated_departments" ON departments FOR ALL TO authenticated USING (true) WITH CHECK (true);`}
          </pre>
        </div>
        
        <div className="flex items-center gap-3 bg-red-50 p-3 border border-red-200">
          <Info className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-[10px] font-medium text-red-800 leading-normal">
            Esse comando ajusta os acessos da Filial 02 e Filial 04 de forma definitiva.
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
