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
        "bg-white rounded-xl shadow-xl border border-slate-200 p-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[85vh] overflow-y-auto",
        "open:animate-in open:fade-in-0 open:zoom-in-95 open:duration-200"
      )}
    >
      <div className="flex flex-col min-w-0">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{title}</h2>
        </div>
        <div className="p-5 sm:p-6">
          {children}
        </div>
      </div>
    </dialog>
  );
}
