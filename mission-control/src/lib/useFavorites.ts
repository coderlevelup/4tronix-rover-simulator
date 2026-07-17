'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'mars-rover-favorites';

export interface FavoriteMission {
  id: string;
  name: string;
  favoritedAt: string;
}

function readFavorites(): FavoriteMission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeFavorites(favorites: FavoriteMission[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteMission[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage; not readable during SSR render
    setFavorites(readFavorites());
  }, []);

  const isFavorite = useCallback(
    (missionId: string) => favorites.some((f) => f.id === missionId),
    [favorites]
  );

  const addFavorite = useCallback((id: string, name: string) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === id)) return prev;
      const next = [...prev, { id, name, favoritedAt: new Date().toISOString() }];
      writeFavorites(next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.id !== id);
      writeFavorites(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback(
    (id: string, name: string) => {
      if (isFavorite(id)) removeFavorite(id);
      else addFavorite(id, name);
    },
    [isFavorite, addFavorite, removeFavorite]
  );

  return { favorites, isFavorite, addFavorite, removeFavorite, toggleFavorite };
}
