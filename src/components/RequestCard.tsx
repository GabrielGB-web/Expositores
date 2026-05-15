import React, { useState, useEffect } from 'react';
import { Camera, CheckCircle2, Clock, Tag, Hash, DollarSign, Image as ImageIcon, Loader2, Info, ChevronDown, ChevronUp, User, ThumbsUp, ThumbsDown, Trash2, Shield, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { DisplayRequest } from '../types';

export interface RequestCardProps {
  request: DisplayRequest;
  isAdmin?: boolean;
  onStatusChange?: () => void;
}

const RequestCard: React.FC<RequestCardProps> = ({ request, isAdmin, onStatusChange }) => {
  const [uploading, setUploading] = useState(false);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (!confirm("Excluir permanentemente este registro?")) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('requests')
        .delete()
        .eq('id', request.id);
      if (error) throw error;
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      alert("Erro ao excluir: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleStatusUpdate = async (newStatus: 'approved' | 'rejected' | 'pending') => {
    if (!isAdmin) return;
    
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('requests')
        .update({ status: newStatus })
        .eq('id', request.id);

      if (error) throw error;
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      alert("Erro ao atualizar status: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${request.id}_${Date.now()}.${fileExt}`;
      const filePath = `delivery_proofs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('delivery_proofs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('delivery_proofs')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'delivered',
          photo_url: publicUrl,
        })
        .eq('id', request.id);

      if (updateError) throw updateError;
      setShowSuccess(true);
      if (onStatusChange) onStatusChange();
    } catch (err) {
      console.error("Update error:", err);
      alert("Falha ao enviar comprovante. Verifique as configurações do Storage no Supabase.");
    } finally {
      setUploading(false);
    }
  };

  const formattedDate = request.created_at 
    ? new Date(request.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      })
    : 'DATA INDISPONÍVEL';

  return (
    <div className={`bg-white border-2 border-[#141414] overflow-hidden transition-all shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] ${request.status === 'delivered' ? 'opacity-90' : ''}`}>
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-green-600 text-white p-2 text-center text-[10px] font-black uppercase tracking-[0.2em]"
          >
            ✓ Foto Registrada com Sucesso!
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row h-full">
        {/* Status Bar */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full sm:w-20 flex sm:flex-col items-center justify-center p-3 text-white border-b sm:border-b-0 sm:border-r border-[#141414] transition-colors cursor-pointer group ${
            request.status === 'delivered' ? 'bg-green-600' : 
            request.status === 'approved' ? 'bg-blue-600' : 
            request.status === 'rejected' ? 'bg-red-600' : 'bg-[#141414]'
          }`}
        >
          {isAdmin && request.user_email && (
             <div className="hidden sm:block absolute top-2 left-0 w-full text-center px-1">
                <span className="text-[7px] font-black uppercase opacity-50 block leading-tight">{request.user_email.split('@')[0]}</span>
             </div>
          )}
          {request.status === 'delivered' ? (
            <CheckCircle2 className="w-6 h-6" />
          ) : request.status === 'approved' ? (
            <ThumbsUp className="w-6 h-6" />
          ) : request.status === 'rejected' ? (
            <ThumbsDown className="w-6 h-6" />
          ) : (
            <Clock className="w-6 h-6 animate-pulse" />
          )}
          <span className="text-[9px] sm:vertical-rl sm:rotate-180 uppercase font-black tracking-[0.2em] ml-3 sm:ml-0 sm:mt-6 whitespace-nowrap">
            {request.status === 'delivered' ? 'Concluído' : 
             request.status === 'approved' ? 'Aprovado' : 
             request.status === 'rejected' ? 'Reprovado' : 'Aguardando'}
          </span>
          <div className="sm:mt-auto pt-2 hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* Info Grid */}
        <div 
          className="flex-1 p-6 grid grid-cols-1 sm:grid-cols-2 gap-8 relative cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-4">
               {request.display_image && (
                 <div className="w-16 h-16 bg-gray-100 border border-[#141414]/10 rounded-sm overflow-hidden flex-shrink-0">
                    <img src={request.display_image} alt="Ref" className="w-full h-full object-cover grayscale opacity-50" />
                 </div>
               )}
               <div>
                  <h3 className="font-black text-lg uppercase leading-none tracking-tighter">{request.display_name}</h3>
                  <div className="mt-1 font-mono text-[10px] font-black uppercase text-blue-600 tracking-wider">
                    {request.customer_name}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#141414]/40 font-mono text-[9px] uppercase mt-2 font-bold">
                    <span className="italic">SOLICITADO EM {formattedDate}</span>
                    {isAdmin && request.user_email && (
                      <>
                        <span className="text-[#141414]/20">•</span>
                        <span className="flex items-center gap-1 text-blue-600">
                          <User className="w-3 h-3" />
                          Vendedor: {request.user_email}
                        </span>
                      </>
                    )}
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-4 border-t-2 border-dashed border-[#141414]/5">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[9px] text-[#141414]/40 font-black uppercase tracking-widest">
                  <Hash className="w-3 h-3" /> N. Pedido
                </div>
                <div className="font-mono text-sm font-black text-[#141414] tracking-tight">{request.order_number}</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[9px] text-[#141414]/40 font-black uppercase tracking-widest">
                  <Tag className="w-3 h-3" /> C. Cliente
                </div>
                <div className="font-mono text-sm font-black text-[#141414] tracking-tight">{request.customer_code}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#141414]/5 font-mono text-xs font-black border border-[#141414]/10 rounded-sm">
                  <DollarSign className="w-3 h-3 text-[#141414]" />
                  R$ {request.order_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#141414] text-white font-mono text-xs font-black border border-[#141414] rounded-sm">
                  <Package className="w-3 h-3" />
                  {request.quantity} UN
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-end space-y-4" onClick={e => e.stopPropagation()}>
            {isAdmin && (
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="w-3 h-3 text-red-600" />
                <span className="text-[8px] font-black uppercase text-red-600 tracking-tighter">Acesso Administrativo Ativo</span>
              </div>
            )}
            
            {request.status !== 'delivered' && request.status !== 'rejected' ? (
              <div className="space-y-2">
                {/* Admin Controls */}
                {isAdmin && request.status === 'pending' && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button 
                      onClick={() => handleStatusUpdate('approved')}
                      disabled={processing}
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 font-black uppercase text-[10px] transition-all tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                    >
                      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                      Aprovar
                    </button>
                    <button 
                      onClick={() => handleStatusUpdate('rejected')}
                      disabled={processing}
                      className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-3 font-black uppercase text-[10px] transition-all tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                    >
                      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                      Reprovar
                    </button>
                  </div>
                )}

                {/* Status indicator for non-admins or special cases */}
                {!isAdmin && request.status === 'pending' && (
                   <div className="bg-[#141414]/5 border-2 border-[#141414]/10 p-3 flex items-center justify-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-[#141414]/40" />
                      <span className="text-[10px] font-black uppercase text-[#141414]/60 tracking-widest">Aguardando Avaliação</span>
                   </div>
                )}

                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onChange={handlePhotoUpload}
                    disabled={uploading || (request.status === 'pending' && !isAdmin)}
                  />
                  <button 
                    disabled={uploading || (request.status === 'pending' && !isAdmin)}
                    className={`w-full flex items-center justify-center gap-4 border-4 border-[#141414] py-5 font-black uppercase text-xs transition-all tracking-[0.2em] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 ${
                      (request.status === 'pending' && !isAdmin) 
                      ? 'bg-gray-100 text-[#141414]/20 border-gray-200 cursor-not-allowed shadow-none' 
                      : 'bg-[#E4E3E0] hover:bg-[#141414] hover:text-white'
                    }`}
                  >
                    {uploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                    {uploading ? 'ENVIANDO...' : 'REGISTRAR ENTREGA'}
                  </button>
                </div>
                {isAdmin && (
                  <button 
                    onClick={(e) => handleDelete(e)}
                    disabled={processing}
                    className="w-full py-2 text-[8px] font-black uppercase tracking-widest text-red-600 hover:underline flex items-center justify-center gap-2"
                  >
                    {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Excluir Registro
                  </button>
                )}
              </div>
            ) : request.status === 'rejected' ? (
              <div className="space-y-2">
                <div className="bg-red-50 border-2 border-red-200 p-4 flex items-center justify-center gap-3">
                  <ThumbsDown className="w-5 h-5 text-red-500" />
                  <span className="text-[10px] font-black uppercase text-red-700 tracking-widest">Solicitação Recusada</span>
                </div>
                {isAdmin && (
                  <button 
                    onClick={(e) => handleDelete(e)}
                    disabled={processing}
                    className="w-full py-2 text-[8px] font-black uppercase tracking-widest text-red-600 hover:underline flex items-center justify-center gap-2"
                  >
                    {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Excluir Definitivamente
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <span className="text-[10px] font-black uppercase text-[#141414]/40 tracking-widest">Comprovante Digital</span>
                   {isAdmin && (
                    <button 
                      onClick={(e) => handleDelete(e)}
                      className="text-red-600 underline text-[8px] font-black uppercase"
                    >
                      Excluir
                    </button>
                   )}
                </div>
                <button 
                  onClick={() => setShowPhotoPreview(true)}
                  className="w-full h-24 border-2 border-[#141414] relative group overflow-hidden bg-gray-50 flex items-center justify-center"
                >
                  {request.photo_url ? (
                    <img src={request.photo_url} alt="Proof" className="w-full h-full object-cover transition-all group-hover:scale-110" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-[#141414]/10" />
                  )}
                  <div className="absolute inset-0 bg-[#141414]/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-black text-[10px] uppercase tracking-widest">
                    Ver Ampliado
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && request.display_image && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t-2 border-[#141414] bg-[#F9F9F8] p-6"
          >
            <div className="flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-1/3 aspect-square bg-white border-2 border-[#141414] overflow-hidden shadow-[4px_4px_0px_0px_rgba(20,20,20,0.1)]">
                <img src={request.display_image} alt={request.display_name} className="w-full h-full object-contain p-2" />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#141414]" />
                  <span className="font-black uppercase text-xs tracking-widest text-[#141414]">Detalhes do Expositor</span>
                </div>
                <p className="text-xs font-bold text-[#141414]/60 leading-relaxed max-w-lg">
                  Este é o modelo de expositor solicitado para o cliente. Certifique-se de que a montagem/entrega corresponde a este padrão visual antes de registrar a foto de comprovação.
                </p>
                <div className="bg-white border-l-4 border-[#141414] p-3 flex justify-between items-center">
                  <div>
                    <span className="block text-[8px] font-black uppercase text-[#141414]/40 mb-1">Identificação Interna</span>
                    <span className="font-mono text-[10px] font-bold text-[#141414]">{request.display_id}</span>
                  </div>
                  {request.display_code && (
                    <div className="text-right">
                      <span className="block text-[8px] font-black uppercase text-[#141414]/40 mb-1">Cód. Catálogo</span>
                      <span className="font-mono text-[10px] font-black bg-[#141414] text-white px-2 py-0.5">{request.display_code}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPhotoPreview && request.photo_url && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPhotoPreview(false)}
            className="fixed inset-0 z-[100] bg-[#141414]/95 flex items-center justify-center p-4 cursor-zoom-out backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-3xl w-full bg-white border-2 border-[#141414] shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3 border-b-2 border-[#141414] flex justify-between items-center bg-white">
                 <h4 className="font-black uppercase text-xs tracking-widest">{request.display_name} // Comprovante</h4>
                 <button onClick={() => setShowPhotoPreview(false)} className="text-[10px] font-black uppercase hover:underline">Fechar [X]</button>
              </div>
              <div className="bg-gray-100 aspect-video overflow-hidden">
                 <img src={request.photo_url} alt="Large Proof" className="w-full h-full object-contain" />
              </div>
              <div className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] font-mono text-[#141414]/60 font-bold uppercase">
                <span>Pedido: {request.order_number}</span>
                <span>Cliente: {request.customer_code}</span>
                <span className="text-[#141414]">{request.customer_name}</span>
                <span className="ml-auto">Solicitado: {formattedDate}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RequestCard;
