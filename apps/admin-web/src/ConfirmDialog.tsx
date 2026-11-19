import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Trash2, X, type LucideIcon } from "lucide-react";
import { ErrorBox } from "./shared.js";

type ConfirmDialogProps = {
  title: string;
  description: string;
  subject: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  icon?: LucideIcon;
  onConfirm: () => Promise<void>;
  onClose: (confirmed: boolean) => void;
};

export default function ConfirmDialog({
  title,
  description,
  subject,
  confirmLabel,
  pendingLabel,
  icon: Icon = Trash2,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const descriptionId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    dialog.current?.showModal();
    cancelButton.current?.focus();
  }, []);

  function close(confirmed: boolean) {
    dialog.current?.close();
    onClose(confirmed);
  }

  return (
    <dialog
      ref={dialog}
      className="workbench-dialog confirm-dialog"
      role="alertdialog"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) close(false);
      }}
    >
      <header className="confirm-heading">
        <span className="confirm-symbol">
          <Icon size={20} aria-hidden="true" />
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭确认弹窗"
          disabled={pending}
          onClick={() => close(false)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="dialog-body confirm-body">
        <h2 id={labelId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-subject">{subject}</div>
        <ErrorBox error={error} />
      </div>
      <footer className="dialog-actions">
        <button
          type="button"
          ref={cancelButton}
          disabled={pending}
          onClick={() => close(false)}
        >
          取消
        </button>
        <button
          type="button"
          className="primary"
          aria-disabled={pending}
          onClick={async () => {
            if (pending) return;
            setPending(true);
            setError(null);
            try {
              await onConfirm();
              close(true);
            } catch (failure) {
              setError(failure);
              setPending(false);
            }
          }}
        >
          {pending && (
            <LoaderCircle size={15} className="spin" aria-hidden="true" />
          )}
          <span aria-live="polite">
            {pending ? pendingLabel : confirmLabel}
          </span>
        </button>
      </footer>
    </dialog>
  );
}
