import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, Package, ShieldCheck, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [isSignUp, setIsSignUp] = useState(false);
  const [showSignUpOption, setShowSignUpOption] = useState(false);

  useEffect(() => {
    // Só mostra a opção de cadastro se o link tiver o parâmetro ?signup=true
    const params = new URLSearchParams(window.location.search);
    if (params.get('signup') === 'true') {
      setShowSignUpOption(true);
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        alert("Conta criada com sucesso! Você já pode realizar o login.");
        setIsSignUp(false);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      let message = err.message || "Erro na autenticação.";
      if (message.includes("rate limit")) {
        message = "Limite de e-mails excedido pelo servidor. Aguarde alguns minutos ou desative a 'Confirmação de E-mail' no painel do Supabase.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center p-4 selection:bg-[#141414] selection:text-white">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white border-4 border-[#141414] p-8 shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] relative overflow-hidden">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="bg-[#141414] p-3 rounded-sm mb-4">
              <Package className="text-white w-8 h-8" />
            </div>
            <h1 className="font-black text-2xl uppercase tracking-tighter text-center leading-none">
              PORTAL DE EXPOSITORES FRANCAL
            </h1>
            <p className="text-[10px] font-mono font-bold text-[#141414]/40 mt-2 uppercase tracking-widest text-center">
              {isSignUp ? 'CADASTRO DE COLABORADOR' : 'LOGÍSTICA E DISTRIBUIÇÃO'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/60 flex items-center gap-1.5 px-1">
                <Mail className="w-3 h-3" /> E-mail Profissional
              </label>
              <input 
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nome@empresa.com"
                className="w-full border-2 border-[#141414] p-4 font-bold outline-none focus:bg-[#141414]/5 transition-colors"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/60 flex items-center gap-1.5 px-1">
                <Lock className="w-3 h-3" /> Senha de Acesso
              </label>
              <input 
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border-2 border-[#141414] p-4 font-bold outline-none focus:bg-[#141414]/5 transition-colors"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 flex items-start gap-3">
                <AlertCircle className="text-red-500 w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-red-700 text-[10px] font-bold uppercase leading-relaxed">{error}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#141414] text-white font-black uppercase tracking-[0.3em] text-xs shadow-[8px_8px_0px_0px_rgba(20,20,20,0.3)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  {isSignUp ? 'CRIAR MINHA CONTA' : 'ENTRAR NO SISTEMA'}
                </>
              )}
            </button>
          </form>

          {showSignUpOption && (
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="w-full mt-6 text-[10px] font-black uppercase tracking-widest text-[#141414]/40 hover:text-[#141414] transition-colors"
            >
              {isSignUp ? 'Já tenho conta. Fazer Login' : 'Não tem conta? Criar Agora'}
            </button>
          )}

          <div className="mt-10 pt-6 border-t-2 border-dashed border-[#141414]/10 flex items-center justify-center gap-2 text-[#141414]/30 grayscale">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[9px] font-black uppercase tracking-widest">Conexão Segura SSL/LS</span>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 p-4 bg-white/50 border-2 border-dashed border-[#141414]/20 rounded-lg">
           <p className="text-[9px] font-mono text-[#141414]/40 text-center leading-relaxed">
             Dúvidas no acesso? Entre em contacto com o Administrador via TI central.<br/>
             O catálogo é gerido exclusivamente por administradores.
           </p>
        </div>
      </motion.div>
    </div>
  );
}
