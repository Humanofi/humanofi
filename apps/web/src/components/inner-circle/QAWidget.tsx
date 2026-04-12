"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PaperPlaneTilt, ChatCircleDots, Check, Eye, EyeSlash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useAuthFetch } from "@/lib/authFetch";

interface QuestionData {
  id: string;
  post_id: string;
  wallet_address: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

interface QAWidgetProps {
  postId: string;
  mintAddress: string;
  walletAddress: string;
  isCreator: boolean;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function QAWidget({ postId, mintAddress, walletAddress, isCreator }: QAWidgetProps) {
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const authFetch = useAuthFetch();

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await authFetch(
        `/api/inner-circle/${mintAddress}/questions?postId=${postId}`
      );
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
        setTotalCount(data.totalCount || 0);
        setAnsweredCount(data.answeredCount || 0);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [postId, mintAddress, walletAddress]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleAsk = async () => {
    if (!newQuestion.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/inner-circle/${mintAddress}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", postId, question: newQuestion.trim() }),
      });
      if (res.ok) {
        const { question } = await res.json();
        setQuestions((prev) => [...prev, question]);
        setNewQuestion("");
        toast.success("Question sent!");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to send");
      }
    } catch {
      toast.error("Failed to send");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswer = async (questionId: string) => {
    const answer = answerInputs[questionId]?.trim();
    if (!answer) return;
    setAnswering(questionId);
    try {
      const res = await authFetch(`/api/inner-circle/${mintAddress}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer", questionId, answer }),
      });
      if (res.ok) {
        const { question } = await res.json();
        setQuestions((prev) => prev.map((q) => (q.id === questionId ? question : q)));
        setAnswerInputs((prev) => ({ ...prev, [questionId]: "" }));
        setAnsweredCount((c) => c + 1);
        toast.success("Answer published!");
      } else {
        toast.error("Failed to answer");
      }
    } catch {
      toast.error("Failed to answer");
    } finally {
      setAnswering(null);
    }
  };

  const unanswered = questions.filter((q) => !q.answer);
  const answered = questions.filter((q) => q.answer);

  return (
    <div className="qa-widget">
      {/* Stats bar */}
      <div className="qa-widget__stats">
        <ChatCircleDots size={14} weight="bold" />
        {isCreator ? (
          <span>{totalCount} question{totalCount !== 1 ? "s" : ""} · {answeredCount} answered</span>
        ) : (
          <span>{questions.length} question{questions.length !== 1 ? "s" : ""} from you</span>
        )}
        <div className="qa-widget__privacy">
          <EyeSlash size={12} weight="bold" />
          <span>Private</span>
        </div>
      </div>

      {loading ? (
        <div className="qa-widget__loading">Loading questions...</div>
      ) : (
        <>
          {/* Unanswered questions */}
          {unanswered.length > 0 && (
            <div className="qa-widget__section">
              <div className="qa-widget__section-label">Waiting for answer</div>
              <AnimatePresence>
                {unanswered.map((q) => (
                  <motion.div
                    key={q.id}
                    className="qa-card qa-card--pending"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="qa-card__question">
                      <span className="qa-card__q-mark">Q</span>
                      <p>{q.question}</p>
                      <span className="qa-card__time">{timeAgo(q.created_at)}</span>
                    </div>

                    {isCreator && (
                      <div className="qa-card__answer-form">
                        <textarea
                          className="qa-card__answer-input"
                          placeholder="Type your answer..."
                          value={answerInputs[q.id] || ""}
                          onChange={(e) => setAnswerInputs((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          rows={2}
                        />
                        <button
                          className="qa-card__answer-btn"
                          onClick={() => handleAnswer(q.id)}
                          disabled={answering === q.id || !answerInputs[q.id]?.trim()}
                        >
                          {answering === q.id ? "Sending..." : "Answer"}
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Answered questions */}
          {answered.length > 0 && (
            <div className="qa-widget__section">
              <div className="qa-widget__section-label">
                <Check size={12} weight="bold" /> Answered
              </div>
              <AnimatePresence>
                {answered.map((q) => (
                  <motion.div
                    key={q.id}
                    className="qa-card qa-card--answered"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="qa-card__question">
                      <span className="qa-card__q-mark">Q</span>
                      <p>{q.question}</p>
                      <span className="qa-card__time">{timeAgo(q.created_at)}</span>
                    </div>
                    <div className="qa-card__answer">
                      <span className="qa-card__a-mark">A</span>
                      <p>{q.answer}</p>
                      {q.answered_at && <span className="qa-card__time">{timeAgo(q.answered_at)}</span>}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Submit form (holder only) */}
          {!isCreator && (
            <div className="qa-widget__ask">
              <textarea
                className="qa-widget__ask-input"
                placeholder="Ask a private question..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                maxLength={500}
                rows={2}
              />
              <div className="qa-widget__ask-bar">
                <span className="qa-widget__ask-info">
                  <EyeSlash size={12} /> Only you and the creator can see this
                </span>
                <div className="qa-widget__ask-right">
                  <span className="qa-widget__charcount">{newQuestion.length}/500</span>
                  <button
                    className="qa-widget__ask-btn"
                    onClick={handleAsk}
                    disabled={submitting || !newQuestion.trim()}
                  >
                    <PaperPlaneTilt size={14} weight="bold" />
                    {submitting ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {questions.length === 0 && !isCreator && (
            <div className="qa-widget__empty">
              Be the first to ask a question!
            </div>
          )}
          {questions.length === 0 && isCreator && (
            <div className="qa-widget__empty">
              No questions yet. Your holders will see this and start asking!
            </div>
          )}
        </>
      )}
    </div>
  );
}
