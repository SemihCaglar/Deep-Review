'use client';

import React, { createContext, useContext } from 'react';
import { useUser } from '@/components/context/UserContext';

export type SelectedLab = {
  id: string;
  name: string;
  status: string;
};

type LabContextType = {
  selectedLab: SelectedLab | null;
  selectLab: (lab: SelectedLab) => void;
  clearSelectedLab: () => void;
};

const SELECTED_LAB_KEY = 'bilsen_selected_lab';
const EMPTY_CONTEXT: LabContextType = {
  selectedLab: null,
  selectLab: () => {},
  clearSelectedLab: () => {},
};

const LabContext = createContext<LabContextType | undefined>(undefined);

export function LabContextProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [selectedLab, setSelectedLab] = React.useState<SelectedLab | null>(() => readSelectedLab());

  const clearSelectedLab = React.useCallback(() => {
    setSelectedLab(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SELECTED_LAB_KEY);
    }
  }, []);

  const selectLab = React.useCallback((lab: SelectedLab) => {
    setSelectedLab(lab);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SELECTED_LAB_KEY, JSON.stringify(lab));
    }
  }, []);

  React.useEffect(() => {
    const storedLab = readSelectedLab();
    const validLab = validateSelectedLab(storedLab, user.labs);

    if (validLab) {
      setSelectedLab(validLab);
    } else {
      clearSelectedLab();
    }
  }, [clearSelectedLab, user.labs]);

  return (
    <LabContext.Provider value={{ selectedLab, selectLab, clearSelectedLab }}>
      {children}
    </LabContext.Provider>
  );
}

export function useLabContext() {
  return useContext(LabContext) ?? EMPTY_CONTEXT;
}

function readSelectedLab(): SelectedLab | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawSelectedLab = window.localStorage.getItem(SELECTED_LAB_KEY);

  if (!rawSelectedLab) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSelectedLab) as Partial<SelectedLab>;

    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.status !== 'string' ||
      !parsed.id.trim()
    ) {
      return null;
    }

    return {
      id: parsed.id,
      name: parsed.name,
      status: parsed.status,
    };
  } catch {
    return null;
  }
}

function validateSelectedLab(
  selectedLab: SelectedLab | null,
  userLabs: { id: string; name: string }[] | undefined,
) {
  if (!selectedLab) {
    return null;
  }

  const matchingLab = userLabs?.find(lab => lab.id === selectedLab.id);

  if (!matchingLab) {
    return null;
  }

  return {
    ...selectedLab,
    name: matchingLab.name,
  };
}
