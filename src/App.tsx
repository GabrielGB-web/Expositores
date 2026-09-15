/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Package, ClipboardList, PackagePlus, LogOut, User, Shield, Users, Building2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { Profile } from './types';
import { normalizeFilial } from './lib/staff';
import RequestForm from './components/RequestForm';
import RequestList from './components/RequestList';
import DisplayManager from './components/DisplayManager';
import UserManagement from './components/UserManagement';
import Login from './components/Login';

type Tab = 'solicitar' | 'solicitados' | 'catalogo' | 'usuarios';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('solicitar');
  const [initLoading, setInitLoading] = useState(true);
  const [adminSelectedFilial, setAdminSelectedFilial] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email);
      else setInitLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email);
      else {
        setProfile(null);
        setInitLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Real-time listener for current user's profile updates
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel(`profile-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${session.user.id}`
        },
        (payload: any) => {
          if (payload.new) {
            console.log("Sistema: Perfil atualizado em tempo real:", payload.new);
            setProfile(prev => ({
              ...(prev || {}),
              ...payload.new,
              filial: payload.new.filial || '04'
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  async function fetchProfile(uid: string, email?: string) {
    try {
      const currentUserEmail = email || session?.user?.email;
      const cleanEmail = (currentUserEmail || '').toLowerCase().trim();
      const isOwnerEmail = 
        cleanEmail === 'admin@gmail.com' || 
        cleanEmail === 'gabrielicloudgb@gmail.com' || 
        cleanEmail === 'daniel@francal.com' ||
        cleanEmail.includes('juda');

      const isFilial02Email = 
        cleanEmail.includes('juda') || 
        cleanEmail.includes('deivid') || 
        cleanEmail.includes('adriana');

      // Obtém metadados gravados na criação do usuário no Supabase Auth
      const userMeta = session?.user?.user_metadata || {};
      const metaFilial = userMeta.filial as string | undefined;
      const metaRole = userMeta.role as 'admin' | 'vendedor' | undefined;

      console.log("Sistema: Verificando perfil para:", currentUserEmail, "Meta:", { metaFilial, metaRole });

      // 1. Busca perfil pelo id de autenticação
      let { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle(); 

      // 2. Se não encontrou pelo UID mas temos o e-mail, busca pelo e-mail
      if (!currentProfile && currentUserEmail) {
        const { data: profileByEmail } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', currentUserEmail.trim())
          .maybeSingle();

        if (profileByEmail) {
          console.log("Sistema: Perfil vinculado encontrado pelo e-mail:", profileByEmail);
          currentProfile = profileByEmail;
          try {
            await supabase
              .from('profiles')
              .update({ id: uid })
              .eq('email', profileByEmail.email);
          } catch {}
        }
      }

      const defaultRole = (isOwnerEmail || metaRole === 'admin') ? 'admin' : (metaRole || 'vendedor');
      const defaultFilial = metaFilial ? normalizeFilial(metaFilial) : (isFilial02Email ? '02' : '04');

      if (fetchError && !currentProfile) {
        console.error("Sistema: Erro ao buscar perfil no Supabase:", fetchError.message);
        if (isOwnerEmail) {
          const filialToSet = normalizeFilial(metaFilial || defaultFilial);
          setProfile({
            id: uid,
            email: currentUserEmail || '',
            role: 'admin',
            filial: filialToSet
          });
          setAdminSelectedFilial(filialToSet);
          setInitLoading(false);
          return;
        }
      }

      if (!currentProfile) {
        console.log("Sistema: Perfil não existente, criando com Filial:", defaultFilial, "Cargo:", defaultRole);
        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .insert([{ 
            id: uid, 
            email: currentUserEmail || '', 
            role: defaultRole,
            filial: defaultFilial
          }])
          .select()
          .single();

        const finalFilial = normalizeFilial(createdProfile?.filial || defaultFilial);
        if (createError) {
          console.warn("Sistema: Falha ao inserir perfil inicial:", createError.message);
          setProfile({
            id: uid,
            email: currentUserEmail || '',
            role: defaultRole,
            filial: finalFilial
          });
        } else {
          setProfile({ ...createdProfile, filial: finalFilial });
        }
        setAdminSelectedFilial(finalFilial);
      } else {
        console.log("Sistema: Perfil carregado com sucesso. Cargo:", currentProfile.role, "Filial:", currentProfile.filial);
        
        // Se foi promovido a admin (ou é Juda/fundador)
        if ((isOwnerEmail || metaRole === 'admin') && currentProfile.role !== 'admin') {
          console.log("Sistema: Promovendo para ADMIN...");
          try {
            await supabase.from('profiles').update({ role: 'admin' }).eq('id', uid);
          } catch {}
          currentProfile.role = 'admin';
        }

        // Se no cadastro foi definido metaFilial ou é usuário da 02
        const targetFilial = metaFilial ? normalizeFilial(metaFilial) : (isFilial02Email ? '02' : normalizeFilial(currentProfile.filial));
        if (targetFilial && normalizeFilial(currentProfile.filial) !== targetFilial) {
          console.log(`Sistema: Atualizando filial do banco de ${currentProfile.filial} para ${targetFilial}...`);
          try {
            await supabase.from('profiles').update({ filial: targetFilial }).eq('id', uid);
          } catch {}
          currentProfile.filial = targetFilial;
        }
        
        const finalNormalizedFilial = normalizeFilial(currentProfile.filial || defaultFilial);
        setProfile({
          ...currentProfile,
          filial: finalNormalizedFilial
        });

        if (!adminSelectedFilial) {
          setAdminSelectedFilial(finalNormalizedFilial);
        }
      }
    } catch (err: any) {
      console.error("Sistema: Erro na autenticação:", err.message);
    } finally {
      setInitLoading(false);
    }
  }

  const handleLogout = () => supabase.auth.signOut();

  if (initLoading) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <Package className="w-12 h-12 text-[#141414] animate-bounce" />
          <p className="font-black uppercase text-[10px] tracking-widest text-[#141414]/40">Sincronizando Sistema...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  // Active filial: Admins can toggle between 04 and 02 in header; sellers are locked to their profile
  const userRole = profile?.role || 'vendedor';
  const isAdmin = userRole === 'admin';
  const activeFilial = isAdmin ? (adminSelectedFilial || profile?.filial || '04') : (profile?.filial || '04');

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-white">
      {/* Header */}
      <header className="border-b border-[#141414] bg-white sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#141414] p-1.5 rounded-sm">
              <Package className="text-white w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-xl uppercase tracking-tighter italic">PORTAL_FRANCAL</span>
              <div className="flex items-center gap-1 -mt-0.5">
                <span className="text-[8px] font-mono font-black text-purple-700 uppercase tracking-widest">
                  FILIAL {activeFilial}
                </span>
                <span className="text-[8px] text-[#141414]/40 font-mono">• MULTI-FILIAL</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Filial Switcher for Admins */}
            {isAdmin ? (
              <div className="flex items-center bg-gray-100 p-1 border border-[#141414] rounded-sm">
                <span className="text-[8px] font-mono font-black uppercase text-[#141414]/50 px-1.5 hidden md:inline">
                  FILIAL ATIVA:
                </span>
                <button
                  type="button"
                  onClick={() => setAdminSelectedFilial('04')}
                  className={`px-2.5 py-1 text-[9px] font-mono font-black uppercase transition-all ${
                    activeFilial === '04' ? 'bg-[#141414] text-white shadow-sm' : 'text-[#141414] hover:bg-gray-200'
                  }`}
                >
                  Filial 04
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSelectedFilial('02')}
                  className={`px-2.5 py-1 text-[9px] font-mono font-black uppercase transition-all ${
                    activeFilial === '02' ? 'bg-[#141414] text-white shadow-sm' : 'text-[#141414] hover:bg-gray-200'
                  }`}
                >
                  Filial 02
                </button>
              </div>
            ) : (
              /* Locked Filial badge for Seller */
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-900 rounded-sm">
                <Building2 className="w-3.5 h-3.5 text-purple-700" />
                <span className="text-[10px] font-mono font-black uppercase tracking-wider">
                  FILIAL {activeFilial}
                </span>
              </div>
            )}

            {/* Profile badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#141414]/5 rounded-sm border border-[#141414]/5">
              {isAdmin ? (
                <Shield className="w-3.5 h-3.5 text-red-600" />
              ) : (
                <User className="w-3.5 h-3.5 text-blue-600" />
              )}
              <div className="flex flex-col text-left">
                <span className="text-[9px] font-black uppercase tracking-wider leading-tight">
                  {profile?.role?.toUpperCase() || 'USUÁRIO'}
                </span>
                <span className="text-[8px] font-mono font-bold text-[#141414]/50 truncate max-w-[110px] leading-tight">
                  {session.user.email?.split('@')[0]}
                </span>
              </div>
            </div>

            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 hover:text-red-600 transition-colors rounded-sm group"
              title="Sair da Conta"
            >
              <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-[#141414] bg-white sticky top-16 z-40">
        <div className="max-w-5xl mx-auto flex">
          <button
            onClick={() => setActiveTab('solicitar')}
            className={`flex-1 flex items-center justify-center gap-2 py-4 font-black uppercase text-[10px] border-r border-[#141414] transition-all ${
              activeTab === 'solicitar' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'
            }`}
          >
            <PackagePlus className="w-4 h-4" />
            Solicitar
          </button>
          <button
            onClick={() => setActiveTab('solicitados')}
            className={`flex-1 flex items-center justify-center gap-2 py-4 font-black uppercase text-[10px] border-r border-[#141414] transition-all ${
              activeTab === 'solicitados' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Solicitados
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('catalogo')}
                className={`flex-1 flex items-center justify-center gap-2 py-4 font-black uppercase text-[10px] border-r border-[#141414] transition-all ${
                  activeTab === 'catalogo' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'
                }`}
              >
                <Package className="w-4 h-4" />
                Catálogo
              </button>
              <button
                onClick={() => setActiveTab('usuarios')}
                className={`flex-1 flex items-center justify-center gap-2 py-4 font-black uppercase text-[10px] transition-all ${
                  activeTab === 'usuarios' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'
                }`}
              >
                <Users className="w-4 h-4" />
                Usuários
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto p-4 sm:p-6 pb-24">
        <AnimatePresence mode="wait">
          {activeTab === 'solicitar' ? (
            <motion.div
              key={`form-${activeFilial}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <RequestForm 
                onSuccess={() => setActiveTab('solicitados')} 
                userFilial={activeFilial}
                isAdmin={isAdmin}
              />
            </motion.div>
          ) : activeTab === 'solicitados' ? (
            <motion.div
              key={`list-${activeFilial}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <RequestList 
                isAdmin={isAdmin} 
                userFilial={activeFilial}
              />
            </motion.div>
          ) : activeTab === 'catalogo' ? (
            <motion.div
              key={`catalogo-${activeFilial}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DisplayManager 
                initialFilial={activeFilial} 
              />
            </motion.div>
          ) : (
            <motion.div
              key="usuarios"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <UserManagement currentUserFilial={activeFilial} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Info */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-[#141414] bg-white p-3 text-[10px] uppercase font-bold tracking-[0.2em] text-center text-[#141414]/40 z-40">
        FRANCAL DISTRIBUIDORA // FILIAL 04 (MATRIZ) & FILIAL 02 // GESTÃO DE EXPOSITORES
      </footer>
    </div>
  );
}
