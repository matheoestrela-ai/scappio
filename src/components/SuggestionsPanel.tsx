import { useState } from "react";
import {
  Sparkles,
  ChevronRight,
  Lightbulb,
  Link2,
  HelpCircle,
  Plus,
  AlertTriangle,
} from "lucide-react";

export type SuggestionKind = "missing_idea" | "connection" | "question";

export type Suggestion = {
  kind: SuggestionKind;
  label: string;
  level: 1 | 2 | 3;
};

export type Insights = {
  summary: string;
  suggestions: Suggestion[];
  warning: string | null;
};

const KIND_META: Record<
  SuggestionKind,
  { label: string; icon: typeof Lightbulb; color: string; bg: string }
> = {
  missing_idea: {
    label: "Idée manquante",
    icon: Lightbulb,
    color: "text-[#4F46E5]",
    bg: "bg-[#EEF2FF]",
  },
  connection: {
    label: "Connexion",
    icon: Link2,
    color: "text-[#7C3AED]",
    bg: "bg-[#F3E8FF]",
  },
  question: {
    label: "Question",
    icon: HelpCircle,
    color: "text-[#B45309]",
    bg: "bg-[#FEF3C7]",
  },
};

export const SuggestionsPanel = ({
  insights,
  onAdd,
}: {
  insights: Insights;
  onAdd: (label: string, level: 1 | 2 | 3) => void;
}) => {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/90 shadow-elegant backdrop-blur transition hover:bg-accent"
        aria-label="Ouvrir les suggestions"
      >
        <Sparkles className="h-4 w-4 text-primary" />
      </button>
    );
  }

  const hasContent =
    insights.summary || insights.suggestions.length > 0 || insights.warning;

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-background/90 shadow-elegant backdrop-blur">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary text-white shadow-glow">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-sm font-semibold tracking-tight">Suggestions IA</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-accent"
          aria-label="Fermer le panneau"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!hasContent && (
          <p className="text-sm text-muted-foreground">
            Aucune suggestion pour le moment.
          </p>
        )}

        {insights.summary && (
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Résumé
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed">{insights.summary}</p>
          </section>
        )}

        {insights.warning && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed">{insights.warning}</p>
          </div>
        )}

        {insights.suggestions.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pour aller plus loin
            </h3>
            <ul className="space-y-2">
              {insights.suggestions.map((s, i) => {
                const meta = KIND_META[s.kind];
                const Icon = meta.icon;
                return (
                  <li
                    key={`${s.kind}-${i}`}
                    className="group flex items-start gap-2 rounded-lg border border-border bg-card p-2.5 transition hover:border-primary/40 hover:shadow-sm"
                  >
                    <div
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${meta.bg}`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {meta.label}
                      </p>
                      <p className="text-sm leading-snug">{s.label}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAdd(s.label, s.level)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-primary text-white opacity-80 shadow-sm transition hover:opacity-100"
                      aria-label="Ajouter au board"
                      title="Ajouter au board"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
};

export default SuggestionsPanel;
