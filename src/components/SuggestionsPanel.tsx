import { useState } from "react";
import {
  Sparkles,
  ChevronRight,
  Lightbulb,
  Link2,
  HelpCircle,
  BookOpen,
  Check,
  X,
  AlertTriangle,
  RefreshCcw,
  Wand2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BoardLevel, BoardShape } from "@/components/Board";

export type SuggestionCategory =
  | "missing_idea"
  | "connection"
  | "question"
  | "resource";

export type Suggestion = {
  id: string;
  category: SuggestionCategory;
  label: string;
  why: string;
  level: BoardLevel;
  shape?: BoardShape;
  parentHint?: string | null; // node id to attach to
};

export type Insights = {
  summary: string;
  warning: string | null;
  suggestions: Suggestion[];
};

const CATEGORY_META: Record<
  SuggestionCategory,
  { title: string; icon: typeof Lightbulb; color: string; bg: string }
> = {
  missing_idea: {
    title: "Idées manquantes",
    icon: Lightbulb,
    color: "text-[#4F46E5]",
    bg: "bg-[#EEF2FF]",
  },
  connection: {
    title: "Connexions utiles",
    icon: Link2,
    color: "text-[#F97316]",
    bg: "bg-[#F3E8FF]",
  },
  question: {
    title: "Questions à explorer",
    icon: HelpCircle,
    color: "text-[#B45309]",
    bg: "bg-[#FEF3C7]",
  },
  resource: {
    title: "Ressources à ajouter",
    icon: BookOpen,
    color: "text-[#0E7490]",
    bg: "bg-[#CFFAFE]",
  },
};

const ORDER: SuggestionCategory[] = [
  "missing_idea",
  "connection",
  "question",
  "resource",
];

export const SuggestionsPanel = ({
  insights,
  loading,
  improving,
  onAccept,
  onReject,
  onRefresh,
  onAutoImprove,
}: {
  insights: Insights | null;
  loading?: boolean;
  improving?: boolean;
  onAccept: (s: Suggestion) => void;
  onReject: (id: string) => void;
  onRefresh: () => void;
  onAutoImprove: () => void;
}) => {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/90 shadow-elegant backdrop-blur transition hover:bg-accent"
        aria-label="Ouvrir les suggestions"
        title="Ouvrir les suggestions"
      >
        <Sparkles className="h-4 w-4 text-primary" />
      </button>
    );
  }

  const grouped = ORDER.map((cat) => ({
    cat,
    items: (insights?.suggestions ?? []).filter((s) => s.category === cat),
  }));

  return (
    <aside className="flex w-full md:w-[340px] h-full md:h-auto shrink-0 flex-col overflow-hidden rounded-none md:rounded-2xl border-0 md:border md:border-border bg-background/90 shadow-none md:shadow-elegant backdrop-blur">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-primary text-white shadow-glow">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-sm font-semibold tracking-tight">Agent IA</h2>
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

      <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onRefresh}
            disabled={loading || improving}
          >
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Actualiser
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-gradient-primary shadow-glow hover:opacity-90"
            onClick={onAutoImprove}
            disabled={loading || improving}
          >
            {improving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Auto-améliorer
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {!insights && !loading && (
          <p className="text-sm text-muted-foreground">
            Aucune suggestion pour le moment. Clique sur « Actualiser » pour analyser ton board.
          </p>
        )}

        {loading && !insights && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyse du board…
          </div>
        )}

        {insights?.summary && (
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Résumé
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed">{insights.summary}</p>
          </section>
        )}

        {insights?.warning && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed">{insights.warning}</p>
          </div>
        )}

        {grouped.map(({ cat, items }) => {
          if (!items.length) return null;
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          return (
            <section key={cat} className="space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.bg}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                </div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {meta.title}
                </h3>
              </div>
              <ul className="space-y-2">
                {items.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm"
                  >
                    <p className="text-sm font-medium leading-snug">{s.label}</p>
                    {s.why && (
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">
                        {s.why}
                      </p>
                    )}
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onReject(s.id)}
                        className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground transition hover:bg-accent"
                        aria-label="Rejeter"
                      >
                        <X className="h-3 w-3" /> Rejeter
                      </button>
                      <button
                        type="button"
                        onClick={() => onAccept(s)}
                        className="flex h-7 items-center gap-1 rounded-md bg-gradient-primary px-2 text-xs font-medium text-white shadow-sm transition hover:opacity-90"
                        aria-label="Accepter"
                      >
                        <Check className="h-3 w-3" /> Accepter
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
};

export default SuggestionsPanel;
