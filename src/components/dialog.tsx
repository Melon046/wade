"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * One in-app dialog pattern.
 *
 * The app used to call `window.prompt` and `window.confirm` for renaming and
 * deleting conversations. Those are unstyleable, block the main thread, are
 * announced inconsistently by screen readers, and cannot be themed to match
 * the rest of the product. This module replaces both with a single accessible
 * dialog that:
 *
 *   * is a real `role="dialog"` with `aria-modal="true"` and a labelled title,
 *   * traps focus while open and restores it to the trigger on close,
 *   * closes on Escape and on a backdrop click,
 *   * returns a promise, so call sites read like the native API they replace:
 *
 *       const ok = await dialog.confirm({ title: "Delete chat?" });
 *       const name = await dialog.prompt({ title: "Rename chat" });
 *
 * `confirm` resolves to a boolean, `prompt` to the trimmed string or `null`
 * when cancelled — the same contract as `window.confirm` / `window.prompt`.
 */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

export interface PromptOptions extends ConfirmOptions {
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
}

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

interface DialogRequest {
  id: number;
  kind: "confirm" | "prompt";
  options: ConfirmOptions | PromptOptions;
  resolve: (value: boolean | string | null) => void;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used inside <DialogProvider>.");
  }
  return context;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const nextId = useRef(0);

  const open = useCallback(
    (
      kind: DialogRequest["kind"],
      options: ConfirmOptions | PromptOptions,
    ): Promise<boolean | string | null> =>
      new Promise((resolve) => {
        nextId.current += 1;
        setRequest({ id: nextId.current, kind, options, resolve });
      }),
    [],
  );

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) => open("confirm", options) as Promise<boolean>,
      prompt: (options) => open("prompt", options) as Promise<string | null>,
    }),
    [open],
  );

  const settle = useCallback(
    (value: boolean | string | null) => {
      setRequest((current) => {
        current?.resolve(value);
        return null;
      });
    },
    [],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request && (
        <DialogSurface
          key={request.id}
          request={request}
          onCancel={() => settle(request.kind === "confirm" ? false : null)}
          onConfirm={(value) => settle(value)}
        />
      )}
    </DialogContext.Provider>
  );
}

function DialogSurface({
  request,
  onCancel,
  onConfirm,
}: {
  request: DialogRequest;
  onCancel: () => void;
  onConfirm: (value: boolean | string) => void;
}) {
  const isPrompt = request.kind === "prompt";
  const options = request.options as PromptOptions;
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const [value, setValue] = useState(options.defaultValue ?? "");

  // Remember what had focus so it can be restored on close.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    return () => restoreRef.current?.focus?.();
  }, []);

  // Move focus into the dialog on open.
  useEffect(() => {
    const target = isPrompt ? inputRef.current : panelRef.current;
    target?.focus();
  }, [isPrompt]);

  // Escape closes; Tab is trapped inside the panel.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  const danger = options.tone === "danger";
  const confirmLabel =
    options.confirmLabel ?? (isPrompt ? "Save" : danger ? "Delete" : "Confirm");
  const cancelLabel = options.cancelLabel ?? "Cancel";

  function submit() {
    if (isPrompt) {
      const trimmed = value.trim();
      if (!trimmed) return;
      onConfirm(trimmed);
    } else {
      onConfirm(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[var(--color-panel)] p-5 shadow-2xl"
      >
        <h2
          id={titleId}
          className="text-base font-semibold tracking-tight text-[var(--color-ink-1)]"
        >
          {options.title}
        </h2>

        {options.description && (
          <p
            id={descriptionId}
            className="mt-2 text-sm leading-6 text-[var(--color-ink-4)]"
          >
            {options.description}
          </p>
        )}

        {isPrompt && (
          <div className="mt-4">
            <label
              htmlFor={inputId}
              className="mb-1.5 block text-xs font-medium text-[var(--color-ink-3)]"
            >
              {options.label ?? "Value"}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={value}
              maxLength={options.maxLength}
              placeholder={options.placeholder}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-[var(--color-ink-1)] placeholder-[var(--color-ink-5)] transition focus:border-[var(--color-brand)]/60"
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/10 px-3.5 py-2 text-sm font-medium text-[var(--color-ink-3)] transition hover:bg-white/5 hover:text-white"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPrompt && !value.trim()}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
              danger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-gradient-to-br from-[var(--color-brand-strong)] to-[var(--color-violet)] hover:brightness-110"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
