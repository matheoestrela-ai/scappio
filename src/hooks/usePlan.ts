import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type Plan,
  FREE_BOARD_LIMIT,
  FREE_RECORDING_LIMIT,
  isPaidPlan,
} from "@/lib/plans";

export type PlanState = {
  loading: boolean;
  plan: Plan;
  boardsUsed: number;
  recordingsUsed: number;
  boardsLimit: number | null;     // null = unlimited
  recordingsLimit: number | null; // null = unlimited
  monthResetDate: string | null;
  refresh: () => Promise<void>;
};

export const usePlan = (): PlanState => {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan>("free");
  const [boardsUsed, setBoardsUsed] = useState(0);
  const [recordingsUsed, setRecordingsUsed] = useState(0);
  const [monthResetDate, setMonthResetDate] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPlan("free"); setBoardsUsed(0); setRecordingsUsed(0); return; }
      const { data, error } = await supabase
        .from("profiles")
        .select("plan, boards_generated_this_month, recordings_this_month, month_reset_date")
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data) return;
      const today = new Date().toISOString().slice(0, 10);
      const stale = data.month_reset_date && data.month_reset_date <= today;
      setPlan((data.plan as Plan) ?? "free");
      setBoardsUsed(stale ? 0 : (data.boards_generated_this_month ?? 0));
      setRecordingsUsed(stale ? 0 : (data.recordings_this_month ?? 0));
      setMonthResetDate(data.month_reset_date ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { refresh(); });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  return {
    loading,
    plan,
    boardsUsed,
    recordingsUsed,
    boardsLimit: isPaidPlan(plan) ? null : FREE_BOARD_LIMIT,
    recordingsLimit: isPaidPlan(plan) ? null : FREE_RECORDING_LIMIT,
    monthResetDate,
    refresh,
  };
};
