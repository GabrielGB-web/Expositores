import React, { useState, useEffect } from 'react';
import { 
  Camera, CheckCircle2, Clock, Tag, Hash, DollarSign, 
  Image as ImageIcon, Loader2, Info, ChevronDown, ChevronUp, 
  User, ThumbsUp, ThumbsDown, Trash2, Shield, Package, 
  X, Check, AlertTriangle, MessageSquare, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { DisplayRequest } from '../types';

export interface RequestCardProps {
  request: DisplayRequest;
  isAdmin?: boolean;
  onStatusChange?: () => void;
}

const COMMON_REJECT_REASONS = [
  'Valor do pedido abaixo do mínimo',
  'Cliente sem espaço físico no PDV',
  'Inadimplência ou restrição financeira',
  'Expositor inadequado para o mix',
  'Cancelado a pedido do cliente'
];

const COMMON_PHOTO_REJECT_REASONS = [
  'Foto muito escura ou desfocada',
  'Expositor não aparece montado no PDV',
  'Produtos não abastecidos no expositor',
  'Não é possível identificar o cliente/loja',
  'Comprovante ilegível ou incorreto'
];

const RequestCard: React.FC<RequestCardProps> = ({ request, isAdmin, onStatusChange }) => {
  const [uploading, setUploading] = useState(false);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Modals for rejection reasons
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');

  const [showPhotoRejectModal, setShowPhotoRejectModal] = useState(false);
  const [photoRejectionReasonInput, setPhotoRejectionReasonInput] = useState('');

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

  // Status update: Approve request
  const handleApproveRequest = async () => {
    if (!isAdmin) return;
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('requests')
        .update({ 
          status: 'approved',
          rejection_reason: null
        })
        .eq('id', request.id);

      if (error) throw error;
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      alert("Erro ao aprovar solicitação: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Status update: Reject request with reason
  const handleConfirmReject = async () => {
    if (!isAdmin) return;
    const reason = rejectionReasonInput.trim();
    if (!reason) {
      alert("Por favor, informe o motivo da recusa para orientar o vendedor.");
      return;
    }

    setProcessing(true);
    try {
      // 1. Devolver o estoque do expositor
      const { data: display, error: stockErr } = await supabase
        .from('displays')
        .select('stock')
        .eq('id', request.display_id)
        .single();

      if (stockErr) throw new Error("Erro ao consultar estoque do expositor.");
      
      const { error: updateStockErr } = await supabase
        .from('displays')
        .update({ stock: (display?.stock || 0) + (request.quantity || 0) })
        .eq('id', request.display_id);

      if (updateStockErr) throw updateStockErr;

      // 2. Atualizar status e motivo
      const { error } = await supabase
        .from('requests')
        .update({ 
          status: 'rejected',
          rejection_reason: reason
        })
        .eq('id', request.id);

      if (error) throw error;
      setShowRejectModal(false);
      setRejectionReasonInput('');
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      alert("Erro ao reprovar solicitação: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Photo Approval
  const handleApprovePhoto = async () => {
    if (!isAdmin) return;
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('requests')
        .update({
          photo_status: 'approved',
          photo_rejection_reason: null
        })
        .eq('id', request.id);

      if (error) throw error;
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      alert("Erro ao aprovar foto: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Photo Rejection with Reason
  const handleConfirmPhotoReject = async () => {
    if (!isAdmin) return;
    const reason = photoRejectionReasonInput.trim();
    if (!reason) {
      alert("Por favor, informe o motivo da reprovação da foto.");
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('requests')
        .update({
          photo_status: 'rejected',
          photo_rejection_reason: reason
        })
        .eq('id', request.id);

      if (error) throw error;
      setShowPhotoRejectModal(false);
      setPhotoRejectionReasonInput('');
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      alert("Erro ao reprovar foto: " + err.message);
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
          photo_status: 'pending',
          photo_rejection_reason: null
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
    : 'Data não informada';

  return (
    <div className={`bg-white border-2 border-[#141414] overflow-hidden transition-all shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] ${request.status === 'delivered' ? 'opacity-95' : ''}`}>
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-green-600 text-white p-2 text-center text-[10px] font-black uppercase tracking-[0.2em]"
          >
            ✓ Foto Registrada e Enviada para Avaliação!
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
            {request.status === 'delivered' ? 'Entregue' : 
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
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[9px] font-black bg-[#141414] text-white px-1.5 py-0.5 uppercase">
                      {request.display_code || '---'}
                    </span>
                    <span className="font-mono text-[8px] font-black bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 uppercase">
                      FILIAL {request.filial || '04'}
                    </span>
                    <span className="font-mono text-[8px] font-black text-[#141414]/40 uppercase tracking-widest">
                      {request.department || 'DEPARTAMENTO N/A'}
                    </span>
                  </div>
                  <div className="mt-2 font-mono text-[10px] font-black uppercase text-blue-600 tracking-wider">
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

            {/* Rejection Reason Display Banner on the Left Side */}
            {request.status === 'rejected' && (
              <div className="p-3 bg-red-50 border-2 border-red-300 space-y-1 mt-2">
                <div className="flex items-center gap-1.5 text-red-700 font-black text-[10px] uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Motivo da Recusa Informado pelo Administrador:
                </div>
                <p className="text-xs font-bold text-red-900 bg-white/80 p-2 border border-red-200">
                  {request.rejection_reason || 'Nenhum motivo detalhado foi informado.'}
                </p>
              </div>
            )}
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
                      onClick={handleApproveRequest}
                      disabled={processing}
                      className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 font-black uppercase text-[10px] transition-all tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                    >
                      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                      Aprovar
                    </button>
                    <button 
                      onClick={() => {
                        setRejectionReasonInput('');
                        setShowRejectModal(true);
                      }}
                      disabled={processing}
                      className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-3 font-black uppercase text-[10px] transition-all tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
                    >
                      <ThumbsDown className="w-4 h-4" />
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
              <div className="space-y-3">
                <div className="bg-red-100 border-2 border-red-300 p-4 text-center space-y-1">
                  <div className="flex items-center justify-center gap-2 text-red-800 font-black text-xs uppercase tracking-wider">
                    <ThumbsDown className="w-4 h-4 text-red-600" />
                    Solicitação Recusada
                  </div>
                  <p className="text-[10px] text-red-700 font-bold">
                    O estoque deste expositor foi automaticamente estornado.
                  </p>
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
              /* Concluído / Delivered state with Delivery Photo Verification */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <span className="text-[10px] font-black uppercase text-[#141414]/40 tracking-widest">Comprovante de Entrega</span>
                   {isAdmin && (
                    <button 
                      onClick={(e) => handleDelete(e)}
                      className="text-red-600 underline text-[8px] font-black uppercase"
                    >
                      Excluir
                    </button>
                   )}
                </div>

                {/* Photo Thumbnail */}
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
                    Ver Foto Ampliada
                  </div>
                </button>

                {/* Photo Validation Status Pill */}
                <div>
                  {request.photo_status === 'approved' ? (
                    <div className="p-2 bg-green-50 border-2 border-green-500 text-green-800 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-600 stroke-[3]" />
                      Foto Aprovada pelo Administrador
                    </div>
                  ) : request.photo_status === 'rejected' ? (
                    <div className="p-2.5 bg-red-50 border-2 border-red-500 text-red-800 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-black text-[10px] uppercase tracking-tight text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        Foto Reprovada pelo Administrador
                      </div>
                      <div className="text-[10px] font-bold text-red-900 bg-white/90 p-1.5 border border-red-200">
                        <span className="font-black">Motivo:</span> {request.photo_rejection_reason || 'Foto ilegível ou inadequada.'}
                      </div>

                      {/* Re-upload button for seller */}
                      <div className="relative pt-1">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          onChange={handlePhotoUpload}
                          disabled={uploading}
                        />
                        <button
                          type="button"
                          disabled={uploading}
                          className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 border border-[#141414]"
                        >
                          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Enviar Nova Foto Corrigida
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 bg-amber-50 border-2 border-amber-400 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Foto Aguardando Avaliação
                    </div>
                  )}
                </div>

                {/* Admin Action Buttons for Photo Verification */}
                {isAdmin && (
                  <div className="pt-2 border-t border-[#141414]/10 space-y-2">
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#141414]/40 block text-center">
                      Avaliação da Foto de Entrega:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleApprovePhoto}
                        disabled={processing || request.photo_status === 'approved'}
                        className={`py-2 px-2 font-black text-[9px] uppercase tracking-wider border-2 border-[#141414] flex items-center justify-center gap-1 transition-all ${
                          request.photo_status === 'approved'
                            ? 'bg-green-100 text-green-800 opacity-60 cursor-not-allowed border-green-300'
                            : 'bg-green-600 hover:bg-green-700 text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:shadow-none'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                        {request.photo_status === 'approved' ? 'Já Aprovada' : 'Aprovar Foto'}
                      </button>

                      <button
                        onClick={() => {
                          setPhotoRejectionReasonInput('');
                          setShowPhotoRejectModal(true);
                        }}
                        disabled={processing}
                        className="py-2 px-2 bg-red-600 hover:bg-red-700 text-white font-black text-[9px] uppercase tracking-wider border-2 border-[#141414] flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:shadow-none transition-all"
                      >
                        <X className="w-3 h-3 stroke-[3]" />
                        Reprovar Foto
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Display Details */}
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

      {/* Modal: Rejection Reason for Request */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-[#141414]/90 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-lg w-full bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b-2 border-[#141414] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-red-600 text-white flex items-center justify-center font-black">
                    ✕
                  </div>
                  <h3 className="font-black uppercase text-sm tracking-tight text-[#141414]">
                    Motivo da Recusa da Solicitação
                  </h3>
                </div>
                <button 
                  onClick={() => setShowRejectModal(false)}
                  className="p-1 hover:bg-gray-100 border border-[#141414]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#141414]/70 font-bold">
                O vendedor receberá este motivo detalhado para entender a recusa. O estoque de <span className="font-black text-[#141414]">{request.quantity} unidade(s)</span> será devolvido automaticamente.
              </p>

              {/* Quick suggestions */}
              <div>
                <span className="text-[9px] font-black uppercase text-[#141414]/40 tracking-wider block mb-1.5">
                  Sugestões Rápidas:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_REJECT_REASONS.map(reason => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setRejectionReasonInput(reason)}
                      className="px-2 py-1 bg-gray-100 hover:bg-[#141414] hover:text-white border border-[#141414]/20 text-[10px] font-mono font-bold transition-all text-left"
                    >
                      + {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/60 block mb-1">
                  Escreva o motivo detalhado:
                </label>
                <textarea
                  rows={3}
                  value={rejectionReasonInput}
                  onChange={e => setRejectionReasonInput(e.target.value)}
                  placeholder="Ex: Valor faturado de R$ 1.200 é inferior à exigência mínima de R$ 2.500 estipulada pela filial..."
                  className="w-full border-2 border-[#141414] p-3 font-mono text-xs font-bold outline-none focus:bg-yellow-50"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#141414]/10">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 border-2 border-[#141414] font-black text-xs uppercase hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={processing || !rejectionReasonInput.trim()}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processando...' : 'Confirmar Reprovação'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Rejection Reason for Photo */}
      <AnimatePresence>
        {showPhotoRejectModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-[#141414]/90 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setShowPhotoRejectModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-lg w-full bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-6 space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b-2 border-[#141414] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-red-600 text-white flex items-center justify-center font-black">
                    📷
                  </div>
                  <h3 className="font-black uppercase text-sm tracking-tight text-[#141414]">
                    Motivo da Reprovação da Foto
                  </h3>
                </div>
                <button 
                  onClick={() => setShowPhotoRejectModal(false)}
                  className="p-1 hover:bg-gray-100 border border-[#141414]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#141414]/70 font-bold">
                O vendedor verá este motivo e terá a oportunidade de enviar uma nova foto de comprovação.
              </p>

              {/* Quick suggestions */}
              <div>
                <span className="text-[9px] font-black uppercase text-[#141414]/40 tracking-wider block mb-1.5">
                  Motivos Comuns:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_PHOTO_REJECT_REASONS.map(reason => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setPhotoRejectionReasonInput(reason)}
                      className="px-2 py-1 bg-gray-100 hover:bg-[#141414] hover:text-white border border-[#141414]/20 text-[10px] font-mono font-bold transition-all text-left"
                    >
                      + {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#141414]/60 block mb-1">
                  Explique o que precisa ser corrigido pelo vendedor:
                </label>
                <textarea
                  rows={3}
                  value={photoRejectionReasonInput}
                  onChange={e => setPhotoRejectionReasonInput(e.target.value)}
                  placeholder="Ex: A foto está sem foco e não mostra o expositor montado no ponto de venda. Por favor tire uma foto frontal..."
                  className="w-full border-2 border-[#141414] p-3 font-mono text-xs font-bold outline-none focus:bg-yellow-50"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#141414]/10">
                <button
                  type="button"
                  onClick={() => setShowPhotoRejectModal(false)}
                  className="px-4 py-2 border-2 border-[#141414] font-black text-xs uppercase hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPhotoReject}
                  disabled={processing || !photoRejectionReasonInput.trim()}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processando...' : 'Confirmar Reprovação da Foto'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Large Photo Preview Modal */}
      <AnimatePresence>
        {showPhotoPreview && request.photo_url && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPhotoPreview(false)}
            className="fixed inset-0 z-[120] bg-[#141414]/95 flex items-center justify-center p-4 cursor-zoom-out backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-3xl w-full bg-white border-4 border-[#141414] shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3 border-b-2 border-[#141414] flex justify-between items-center bg-white">
                 <h4 className="font-black uppercase text-xs tracking-widest">{request.display_name} // Comprovante Digital</h4>
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
