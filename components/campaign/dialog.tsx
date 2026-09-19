'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Dialog({ title, children, onClose, wide = false, className = '' }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean; className?:string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = ref.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''} ${className}`} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>
    {children}
  </dialog>;
}
