import { useNavigate } from "react-router-dom";
import { usePlan } from "@/hooks/usePlan";
import { FREE_BOARD_LIMIT } from "@/lib/plans";

const PlanBanner = () => {
  const navigate = useNavigate();
  const { plan, boardsUsed, monthResetDate, loading } = usePlan();

  if (loading) return null;

  // ===== FREE =====
  if (plan === "free") {
    const used = Math.min(boardsUsed, FREE_BOARD_LIMIT);
    const pct = Math.min(100, (used / FREE_BOARD_LIMIT) * 100);
    const atLimit = used >= FREE_BOARD_LIMIT;
    const nearLimit = used === FREE_BOARD_LIMIT - 1;

    let counterText = `Tu as utilisé ${used} boards sur ${FREE_BOARD_LIMIT} ce mois-ci`;
    let buttonText = "Passer en Creator — 14€/mois";
    let barColor = "#F97316";
    let barClass = "";
    let cardBg = "linear-gradient(180deg,#1A1A1A 0%,#242424 100%)";
    let buttonClass = "";

    if (nearLimit) {
      counterText = "Plus qu'1 board gratuit ce mois-ci ⚡";
      buttonText = "Continuer sans limite →";
      barClass = "animate-pulse";
    }
    if (atLimit) {
      counterText = "Limite atteinte pour ce mois 🔒";
      buttonText = "Débloquer maintenant →";
      barColor = "#EF4444";
      cardBg = "linear-gradient(180deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.05) 100%), linear-gradient(180deg,#1A1A1A 0%,#242424 100%)";
      buttonClass = "animate-pulse";
    }

    return (
      <div
        className="mx-3 mb-4 rounded-xl p-4"
        style={{
          background: cardBg,
          borderTop: "2px solid #F97316",
        }}
      >
        <div className="mb-2">
          <span className="inline-block text-[10px] font-semibold uppercase tracking-wide text-[#F97316] bg-[#F97316]/15 px-2 py-0.5 rounded-full">
            Plan Gratuit
          </span>
        </div>
        <div className="text-white font-bold text-base leading-tight">
          Débloquer Scappio
        </div>
        <div className="mt-1 text-[12px] text-gray-400">{counterText}</div>

        <div
          className="mt-2 w-full rounded-[2px] overflow-hidden"
          style={{ height: 4, background: "#2A2A2A" }}
        >
          <div
            className={barClass}
            style={{
              width: `${pct}%`,
              height: "100%",
              background: barColor,
              borderRadius: 2,
              transition: "width 0.3s ease",
            }}
          />
        </div>

        <ul className="mt-3 space-y-1">
          {["Boards illimités", "Enregistrements illimités", "Agent IA inclus"].map((f) => (
            <li key={f} className="flex items-center gap-2 text-[12px] text-gray-300">
              <span className="text-[#F97316] font-bold">✦</span> {f}
            </li>
          ))}
        </ul>

        <button
          onClick={() => navigate("/upgrade")}
          className={`mt-3 w-full rounded-lg font-bold text-[13px] hover:opacity-90 transition ${buttonClass}`}
          style={{
            background: "#F97316",
            color: "#000",
            height: 40,
          }}
        >
          {buttonText}
        </button>
        <div className="mt-2 text-[10px] text-gray-500 text-center">
          ou 97€/an · Annulable en 1 clic
        </div>
      </div>
    );
  }

  const renewLine = monthResetDate
    ? `Prochain renouvellement le ${new Date(monthResetDate).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`
    : "Renouvellement automatique";

  // ===== CREATOR =====
  if (plan === "creator") {
    return (
      <div
        className="mx-3 mb-4 rounded-xl p-3"
        style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: "#22C55E" }}
            />
            <span className="text-white font-bold text-[13px]">Creator</span>
          </div>
          <span className="text-[11px] text-gray-400">Actif</span>
        </div>
        <div className="mt-1 text-[11px] text-gray-500">{renewLine}</div>
      </div>
    );
  }

  // ===== STUDIO =====
  if (plan === "studio") {
    return (
      <div
        className="mx-3 mb-4 rounded-xl p-3"
        style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: "#A855F7" }}
            />
            <span className="text-white font-bold text-[13px]">Studio</span>
          </div>
          <span className="text-[11px] text-gray-400">Actif</span>
        </div>
        <div className="mt-1 text-[11px] text-gray-500">{renewLine}</div>
      </div>
    );
  }

  // ===== LIFETIME =====
  if (plan === "lifetime") {
    return (
      <div
        className="mx-3 mb-4 rounded-xl p-3"
        style={{ background: "#1A1A1A", border: "1px solid #D97706" }}
      >
        <div className="font-bold text-[13px]" style={{ color: "#D97706" }}>
          ✦ Accès à vie
        </div>
        <div className="mt-1 text-[11px] text-gray-500">
          Merci d'avoir cru en Scappio dès le début.
        </div>
      </div>
    );
  }

  return null;
};

export default PlanBanner;
