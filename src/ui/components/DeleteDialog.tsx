import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { useTranslation } from '../../shared/i18n/LanguageContext';

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
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message || t('dialogs.common.genericError') : t('dialogs.common.genericError'));
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
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 mt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isDeleting}>
            {t('dialogs.common.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? t('dialogs.common.deleting') : t('dialogs.common.delete')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
