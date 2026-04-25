import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const Canvas = () => {
  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Link>
        <h1 className="text-sm font-semibold">Canvas libre — prototype tldraw</h1>
        <div className="w-16" />
      </header>

      {/* tldraw canvas takes the remaining space */}
      <div className="flex-1 relative">
        <Tldraw persistenceKey="gribouille-canvas-prototype" />
      </div>
    </div>
  );
};

export default Canvas;
