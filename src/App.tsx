/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Package, ClipboardList, PackagePlus, LogOut, User, Shield, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from './lib/supabase';
import { Profile } from './types';
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

  async function fetchProfile(uid: string, email?: string) {
    try {
      const currentUserEmail = email || session?.user?.email;
      const isOwnerEmail = currentUserEmail === 'admin@gmail.com' || currentUserEmail === 'gabrielicloudgb@gmail.com' || currentUserEmail === 'daniel@francal.com';

      console.log("Sistema: Verificando perfil para:", currentUserEmail);
      console.log("Sistema: É Administrador?", isOwnerEmail);

      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle(); 

      if (fetchError) {
        console.error("Sistema: Erro ao buscar perfil no Supabase:", fetchError.message);
        // Se houver erro de recursão, assumimos o cargo localmente baseado no e-mail
        if (fetchError.message?.includes('recursion') && isOwnerEmail) {
          console.warn("Sistema: Operando em modo de emergência (Recursão detectada).");
          setProfile({
            id: uid,
            email: currentUserEmail || '',
            role: 'admin'
          });
          setInitLoading(false);
          return;
        }
      }

      const role = isOwnerEmail ? 'admin' : 'vendedor';

      if (!existingProfile) {
        console.log("Sistema: Perfil não encontrado, tentando persistir...");
        const { data: newData, error: createError } = await supabase
          .from('profiles')
          .insert([{ 
            id: uid, 
            email: currentUserEmail || '', 
            role: role
          }])
          .select()
          .single();

        if (createError) {
          console.warn("Sistema: Falha ao inserir perfil. Motivo:", createError.message);
          // Se falhou o insert, talvez já exista mas o select falhou. Tentamos upsert como plano C
          const { data: upsertData } = await supabase
            .from('profiles')
            .upsert({ id: uid, email: currentUserEmail || '', role: role })
            .select()
            .single();
          
          if (upsertData) {
            setProfile(upsertData);
          } else {
            console.log("Sistema: Usando perfil local temporário.");
            setProfile({
              id: uid,
              email: currentUserEmail || '',
              role: role
            });
          }
        } else {
          console.log("Sistema: Perfil criado com sucesso.");
          setProfile(newData);
        }
      } else {
        console.log("Sistema: Perfil carregado. Role:", existingProfile.role);
        if (isOwnerEmail && existingProfile.role !== 'admin') {
          console.log("Sistema: Corrigindo role para ADMIN...");
          const { error: updateError } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', uid);
          if (updateError) console.error("Erro ao atualizar role:", updateError.message);
          existingProfile.role = 'admin';
        }
        setProfile(existingProfile);
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

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-white">
      {/* Header */}
      <header className="border-b border-[#141414] bg-white sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-[#141414] p-1.5 rounded-sm">
              <Package className="text-white w-5 h-5" />
            </div>
            <span className="font-black text-xl uppercase tracking-tighter italic">EXPO_MANAGER</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#141414]/5 rounded-sm border border-[#141414]/5">
              {profile?.role === 'admin' ? (
                <Shield className="w-3 h-3 text-red-600" />
              ) : (
                <User className="w-3 h-3 text-blue-600" />
              )}
              <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[120px]">
                {profile?.role} // {session.user.email?.split('@')[0]}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 hover:text-red-600 transition-colors rounded-sm group"
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
            className={`flex-1 flex items-center justify-center gap-2 py-5 font-black uppercase text-[10px] border-r border-[#141414] transition-all ${
              activeTab === 'solicitar' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'
            }`}
          >
            <PackagePlus className="w-4 h-4" />
            Solicitar
          </button>
          <button
            onClick={() => setActiveTab('solicitados')}
            className={`flex-1 flex items-center justify-center gap-2 py-5 font-black uppercase text-[10px] border-r border-[#141414] transition-all ${
              activeTab === 'solicitados' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Solicitados
          </button>
          {profile?.role === 'admin' && (
            <>
              <button
                onClick={() => setActiveTab('catalogo')}
                className={`flex-1 flex items-center justify-center gap-2 py-5 font-black uppercase text-[10px] border-r border-[#141414] transition-all ${
                  activeTab === 'catalogo' ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5'
                }`}
              >
                <Package className="w-4 h-4" />
                Catálogo
              </button>
              <button
                onClick={() => setActiveTab('usuarios')}
                className={`flex-1 flex items-center justify-center gap-2 py-5 font-black uppercase text-[10px] transition-all ${
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
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <RequestForm onSuccess={() => setActiveTab('solicitados')} />
            </motion.div>
          ) : activeTab === 'solicitados' ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <RequestList isAdmin={profile?.role === 'admin'} />
            </motion.div>
          ) : activeTab === 'catalogo' ? (
            <motion.div
              key="catalogo"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DisplayManager />
            </motion.div>
          ) : (
            <motion.div
              key="usuarios"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <UserManagement />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Info */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-[#141414] bg-white p-3 text-[10px] uppercase font-bold tracking-[0.2em] text-center text-[#141414]/40 z-40">
        SUPABASE_DRIVEN // PDV_OPERATIONAL_SYSTEM // 2026
      </footer>
    </div>
  );
}
