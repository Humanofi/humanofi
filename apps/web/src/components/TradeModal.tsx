// ========================================
// Humanofi — Trade Processing Modal
// ========================================
// Shown during buy/sell — displays each step of the process:
//   1. Signing transaction
//   2. Confirming on-chain
//   3. Verifying proof
//   4. Complete
//
// Beautiful animated modal with step progression.

"use client";

import { useEffect, useState } from "react";

export type TradeStep =
  | "idle"
  | "signing"         // Waiting for wallet signature
  | "confirming"      // TX submitted, waiting for confirmation
  | "verifying"       // TX confirmed, saving proof to DB
  | "complete"        // All done
  | "error";          // Failed

interface TradeModalProps {
  isOpen: boolean;
  step: TradeStep;
  tradeType: "buy" | "sell";
  amount: string;
  tokenSymbol: string;
  txSignature?: string;
  errorMessage?: string;
  onClose: () => void;
}

const STEPS = [
  { key: "signing",    label: "Signing Transaction",    icon: "✍️", desc: "Approve in your wallet..." },
  { key: "confirming", label: "Confirming On-Chain",     icon: "⛓️", desc: "Waiting for Solana confirmation..." },
  { key: "verifying",  label: "Verifying Proof",         icon: "🔐", desc: "Recording cryptographic proof..." },
  { key: "complete",   label: "Trade Complete",          icon: "✅", desc: "Your trade has been verified!" },
] as const;

function getStepIndex(step: TradeStep): number {
  const idx = STEPS.findIndex(s => s.key === step);
  return idx >= 0 ? idx : -1;
}

export default function TradeModal({
  isOpen,
  step,
  tradeType,
  amount,
  tokenSymbol,
  txSignature,
  errorMessage,
  onClose,
}: TradeModalProps) {
  const [visible, setVisible] = useState(false);
  const currentIdx = getStepIndex(step);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Auto-close after complete
  useEffect(() => {
    if (step === "complete") {
      const timer = setTimeout(onClose, 2500);
      return () => clearTimeout(timer);
    }
  }, [step, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="trade-modal-overlay"
      style={{ opacity: visible ? 1 : 0 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (step === "complete" || step === "error")) {
          onClose();
        }
      }}
    >
      <div
        className="trade-modal"
        style={{
          transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.95)",
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Header */}
        <div className="trade-modal-header">
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-faint)" }}>
            {tradeType === "buy" ? "Buying" : "Selling"}
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
            {amount} {tradeType === "buy" ? "SOL" : tokenSymbol}
          </div>
        </div>

        {/* Steps */}
        <div className="trade-modal-steps">
          {STEPS.map((s, idx) => {
            const isActive = s.key === step;
            const isDone = currentIdx > idx;
            const isPending = currentIdx < idx;

            return (
              <div
                key={s.key}
                className={`trade-modal-step ${isActive ? "active" : ""} ${isDone ? "done" : ""} ${isPending ? "pending" : ""}`}
              >
                <div className="trade-modal-step-icon">
                  {isDone ? "✓" : isActive ? (
                    <div className="trade-modal-spinner" />
                  ) : (
                    <span style={{ opacity: 0.3 }}>{s.icon}</span>
                  )}
                </div>
                <div className="trade-modal-step-content">
                  <div className="trade-modal-step-label">{s.label}</div>
                  {isActive && (
                    <div className="trade-modal-step-desc">{s.desc}</div>
                  )}
                  {isDone && s.key === "complete" && txSignature && (
                    <div className="trade-modal-step-desc">
                      TX: {txSignature.slice(0, 12)}...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error state */}
        {step === "error" && (
          <div className="trade-modal-error">
            <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>❌</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Transaction Failed</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
              {errorMessage || "Something went wrong. Please try again."}
            </div>
            <button className="trade-modal-close-btn" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {/* Success state */}
        {step === "complete" && txSignature && (
          <div className="trade-modal-success">
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="trade-modal-explorer-link"
            >
              View on Solana Explorer ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
