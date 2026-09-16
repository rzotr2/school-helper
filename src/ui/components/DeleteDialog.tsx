import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';

interface DeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: React.ReactNode;
}

export function DeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description
}: DeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message || 'Ein Fehler ist aufgetreten' : 'Ein Fehler ist aufgetreten');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          {description}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isDeleting}>
            Abbrechen
          </Button>
          <Button
            type="button"
            className="bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-500"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Wird gelöscht...' : 'Löschen'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
