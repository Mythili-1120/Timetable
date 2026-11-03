'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  badge?: string | React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  headerColor?: string;
}

/**
 * Institutional Production Modal Component
 * Reusable modal dialog matching the SSM College royal indigo theme and design specifications.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  badge,
  icon,
  children,
  footer,
  maxWidth = 'lg',
  headerColor = 'bg-[#3431B7]'
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl'
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white rounded-3xl w-full ${maxWidthClasses[maxWidth]} shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in zoom-in-95 duration-150 relative`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header matching template */}
        <div className={`${headerColor} px-6 py-5 text-white flex items-center justify-between`}>
          <div className="flex items-center gap-3.5 min-w-0">
            {icon && (
              <div className="w-11 h-11 rounded-2xl bg-white/20 text-white flex items-center justify-center font-bold text-sm shrink-0 border border-white/10 shadow-2xs">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white tracking-tight truncate leading-snug">
                {title}
              </h3>
              {badge && (
                <div className="mt-0.5">
                  {typeof badge === 'string' ? (
                    <span className="bg-white/20 text-white/90 text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full inline-block border border-white/10">
                      {badge}
                    </span>
                  ) : (
                    badge
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10 shrink-0 ml-3"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[calc(85vh-135px)] overflow-y-auto">
          {children}
        </div>

        {/* Modal Footer */}
        {footer && (
          <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

