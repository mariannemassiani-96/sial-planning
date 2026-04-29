// ═══════════════════════════════════════════════════════════════════════
// Hook unique pour charger la liste des postes de travail.
// Source de vérité : /api/posts (qui lui-même se base sur WORK_POSTS).
// Fallback : la définition TS statique.
// ═══════════════════════════════════════════════════════════════════════

"use client";
import { useEffect, useMemo, useState } from "react";
import { WORK_POSTS, type WorkPostDef, type Phase } from "@/lib/work-posts";

export interface WorkPostFromAPI extends WorkPostDef {
  defaultOperators: string[];
}

export function useWorkPosts(): {
  posts: WorkPostFromAPI[];
  byId: Map<string, WorkPostFromAPI>;
  byPhase: (phase: Phase, onlyVisible?: boolean) => WorkPostFromAPI[];
  loaded: boolean;
} {
  const [posts, setPosts] = useState<WorkPostFromAPI[]>(() =>
    WORK_POSTS.map(p => ({ ...p, defaultOperators: [] }))
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/posts")
      .then(r => r.ok ? r.json() : null)
      .then((data: unknown) => {
        if (Array.isArray(data) && data.length > 0) {
          setPosts(data as WorkPostFromAPI[]);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const byId = useMemo(() => new Map(posts.map(p => [p.id, p] as const)), [posts]);
  const byPhase = useMemo(() => {
    return (phase: Phase, onlyVisible = true): WorkPostFromAPI[] => {
      return posts
        .filter(p => p.phase === phase && (!onlyVisible || p.visible))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    };
  }, [posts]);

  return { posts, byId, byPhase, loaded };
}
