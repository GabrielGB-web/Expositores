import React, { useState } from 'react';
import { Camera, CheckCircle2, Clock, Tag, Hash, DollarSign, Image as ImageIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { DisplayRequest } from '../types';

export interface RequestCardProps {
  request: DisplayRequest;
  isAdmin?: boolean;
}

const RequestCard: React.FC<RequestCardProps> = ({ request, isAdmin }) => {
  const [uploading, setUploading] = useState(false);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);

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
          delivered_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (updateError) throw updateError;
    } catch (err) {
      console.error("Update error:", err);
      alert("Falha ao enviar comprovante. Verifique as configurações do Storage no Supabase.");
    } finally {
      setUploading(false);
    }
  };

  const formattedDate = new Date(request.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  const deliveredDate = request.delivered_at 
    ? new Date(request.delivered_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;

  return (
    <div className={`bg-white border-2 border-[#141414] overflow-hidden transition-all shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] ${request.status === 'delivered' ? 'opacity-90' : ''}`}>
      <div className="flex flex-col sm:flex-row h-full">
        {/* Status Bar */}
        <div className={`w-full sm:w-20 flex sm:flex-col items-center justify-center p-3 text-white border-b sm:border-b-0 sm:border-r border-[#141414] transition-colors ${request.status === 'delivered' ? 'bg-green-600' : 'bg-[#141414]'}`}>
          {isAdmin && request.user_email && (
             <div className="hidden sm:block absolute top-2 left-0 w-full text-center px-1">
                <span className="text-[7px] font-black uppercase opacity-50 block leading-tight">{request.user_email.split('@')[0]}</span>
             </div>
          )}
          {request.status === 'delivered' ? (
            <CheckCircle2 className="w-6 h-6" />
          ) : (
            <Clock className="w-6 h-6 animate-pulse" />
          )}
          <span className="text-[9px] sm:vertical-rl sm:rotate-180 uppercase font-black tracking-[0.2em] ml-3 sm:ml-0 sm:mt-6 whitespace-nowrap">
            {request.status === 'delivered' ? 'Concluído' : 'Aguardando'}
          </span>
        </div>

        {/* Info Grid */}
        <div className="flex-1 p-6 grid grid-cols-1 sm:grid-cols-2 gap-8 relative">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
               {request.display_image && (
                 <div className="w-16 h-16 bg-gray-100 border border-[#141414]/10 rounded-sm overflow-hidden flex-shrink-0">
                    <img src={request.display_image} alt="Ref" className="w-full h-full object-cover grayscale opacity-50" />
                 </div>
               )}
               <div>
                  <h3 className="font-black text-lg uppercase leading-none tracking-tighter">{request.display_name}</h3>
                  <div className="flex items-center gap-1.5 text-[#141414]/40 font-mono text-[9px] uppercase mt-2 font-bold italic">
                    SOLICITADO EM {formattedDate}
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

            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#141414]/5 font-mono text-xs font-black border border-[#141414]/10 rounded-sm">
                <DollarSign className="w-3 h-3 text-[#141414]" />
                R$ {request.order_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="flex flex-col justify-end space-y-4">
            {request.status === 'pending' ? (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                />
                <button 
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-4 bg-[#E4E3E0] hover:bg-[#141414] hover:text-white border-4 border-[#141414] py-5 font-black uppercase text-xs transition-all tracking-[0.2em] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1"
                >
                  {uploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                  {uploading ? 'ENVIANDO...' : 'REGISTRAR CHEGADA'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <span className="text-[10px] font-black uppercase text-[#141414]/40 tracking-widest">Comprovante Digital</span>
                   <span className="text-[10px] font-mono font-bold bg-[#141414] text-white px-2 rounded-sm">{deliveredDate}</span>
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
              <div className="p-4 flex items-center gap-4 text-[10px] font-mono text-[#141414]/60 font-bold uppercase">
                <span>Pedido: {request.order_number}</span>
                <span>Cliente: {request.customer_code}</span>
                <span className="ml-auto">Entrega: {deliveredDate}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RequestCard;
