import React, { useEffect, useRef } from 'react';
import { cn } from '../../shared/utils/cn';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ isOpen, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const dialog = dialogRef.current;
    dialog?.addEventListener('cancel', handleCancel);
    return () => dialog?.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm",
        "bg-white rounded-xl shadow-xl border border-slate-200 p-0 m-auto w-full max-w-md",
        "open:animate-in open:fade-in-0 open:zoom-in-95 open:duration-200"
      )}
    >
      <div className="flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </dialog>
  );
}
