import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WarningCircle } from 'phosphor-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  description,
  confirmText,
  cancelText,
  variant = 'danger',
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const resolvedConfirmText = confirmText || t('modal.confirm');
  const resolvedCancelText = cancelText || t('modal.cancel');

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
      document.body.style.overflow = 'hidden';
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
        document.body.style.overflow = '';
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const variantStyles = {
    danger: {
      icon: 'text-rose-500',
      button: 'bg-rose-500 hover:bg-rose-600 active:bg-rose-700',
    },
    warning: {
      icon: 'text-amber-500',
      button: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700',
    },
    info: {
      icon: 'text-indigo-500',
      button: 'bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700',
    },
  };

  const currentVariant = variantStyles[variant];

  if (!isVisible) return null;

  return (
    <div
      className={`confirm-modal-overlay ${isAnimating ? 'confirm-modal-overlay-active' : ''}`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className={`confirm-modal-container ${isAnimating ? 'confirm-modal-container-active' : ''}`}>
        <div className="confirm-modal-header">
          <div className="confirm-modal-icon-wrapper">
            <WarningCircle size={24} weight="fill" className={currentVariant.icon} />
          </div>
          <h3 id="modal-title" className="confirm-modal-title">
            {title}
          </h3>
        </div>

        <div className="confirm-modal-body">
          <p className="confirm-modal-message">{message}</p>
          {description && <p className="confirm-modal-description">{description}</p>}
        </div>

        <div className="confirm-modal-footer">
          <button
            onClick={onClose}
            className="confirm-modal-button confirm-modal-button-cancel"
            type="button"
          >
            {resolvedCancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`confirm-modal-button confirm-modal-button-confirm ${currentVariant.button}`}
            type="button"
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
