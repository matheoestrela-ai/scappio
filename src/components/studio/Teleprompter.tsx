import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, Type, Eye, EyeOff, RotateCcw } from "lucide-react";

type Props = {
  visible: boolean;
  onToggleVisible: () => void;
};

const STORAGE_KEY = "scappio:studio:script";

export default function Teleprompter({ visible, onToggleVisible }: Props) {
  const [text, setText] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [editing, setEditing] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(40); // px / sec
  const [fontSize, setFontSize] = useState(28);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef<number>(0);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, text); } catch {}
  }, [text]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = (t: number) => {
      const last = lastTRef.current || t;
      const dt = (t - last) / 1000;
      lastTRef.current = t;
      const el = scrollerRef.current;
      if (el) {
        el.scrollTop += speed * dt;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTRef.current = 0;
    };
  }, [playing, speed]);

  if (!visible) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleVisible}
        className="gap-2"
      >
        <Eye className="h-4 w-4" /> Script
      </Button>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Type className="h-4 w-4" /> Téléprompteur
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? "Aperçu" : "Éditer"}
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleVisible} title="Masquer">
            <EyeOff className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écris ou colle ton script ici…"
          className="flex-1 w-full p-3 text-sm bg-background outline-none resize-none"
        />
      ) : (
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto p-6 leading-relaxed bg-background scroll-smooth"
          style={{ fontSize }}
        >
          {text || (
            <p className="text-muted-foreground italic">
              Ajoute du texte en mode « Éditer » pour le faire défiler ici.
            </p>
          )}
          <div className="h-1/2" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
        <Button
          size="sm"
          variant={playing ? "secondary" : "default"}
          onClick={() => {
            if (editing) setEditing(false);
            setPlaying((p) => !p);
          }}
          disabled={!text}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pause" : "Lecture"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            scrollerRef.current && (scrollerRef.current.scrollTop = 0);
            setPlaying(false);
          }}
          title="Revenir au début"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
          Vitesse
          <input
            type="range"
            min={10}
            max={150}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-24 accent-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Taille
          <input
            type="range"
            min={16}
            max={56}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-24 accent-primary"
          />
        </label>
      </div>
    </div>
  );
}
