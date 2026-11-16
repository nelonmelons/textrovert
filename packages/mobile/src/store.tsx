import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Friend, NoteItem, NoteSection } from './fixtures';

type StoredNote = Omit<NoteItem, 'deadline'> & { deadline?: string; edited?: boolean };
export type Note = NoteItem & { edited?: boolean };

type Saved = {
  edits: Record<string, StoredNote>;
  added: Record<string, StoredNote[]>;
  notepad: Record<string, string>;
};

const KEY = 'textrovert.notes.v1';
const empty: Saved = { edits: {}, added: {}, notepad: {} };

const revive = (note: StoredNote): Note => ({ ...note, deadline: note.deadline ? new Date(note.deadline) : undefined });
const freeze = (note: Note): StoredNote => ({ ...note, deadline: note.deadline?.toISOString() });

type Store = {
  items: (friend: Friend, section: NoteSection) => Note[];
  save: (friend: Friend, note: Note) => Promise<void>;
  notepad: (friend: Friend) => string;
  setNotepad: (friend: Friend, text: string) => Promise<void>;
  reset: () => Promise<void>;
};

const NotesContext = createContext<Store | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>(empty);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) setSaved({ ...empty, ...JSON.parse(raw) });
    });
  }, []);

  const persist = useCallback(async (next: Saved) => {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    setSaved(next);
  }, []);

  const store = useMemo<Store>(
    () => ({
      items: (friend, section) => {
        const base = friend.notes.filter((n) => n.section === section).map((n) => (saved.edits[`${friend.id}/${n.id}`] ? revive(saved.edits[`${friend.id}/${n.id}`]) : n));
        return [...base, ...(saved.added[friend.id] ?? []).filter((n) => n.section === section).map(revive)];
      },
      save: async (friend, note) => {
        const next: Saved = { ...saved, edits: { ...saved.edits }, added: { ...saved.added } };
        if (friend.notes.some((n) => n.id === note.id)) {
          next.edits[`${friend.id}/${note.id}`] = freeze({ ...note, edited: true });
        } else {
          const list = [...(next.added[friend.id] ?? [])];
          const index = list.findIndex((n) => n.id === note.id);
          if (index >= 0) list[index] = freeze(note);
          else list.push(freeze(note));
          next.added[friend.id] = list;
        }
        await persist(next);
      },
      notepad: (friend) => saved.notepad[friend.id] ?? '',
      setNotepad: async (friend, text) => {
        await persist({ ...saved, notepad: { ...saved.notepad, [friend.id]: text } });
      },
      reset: async () => {
        await AsyncStorage.removeItem(KEY);
        setSaved(empty);
      },
    }),
    [saved, persist],
  );

  return <NotesContext.Provider value={store}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const store = useContext(NotesContext);
  if (!store) throw new Error('useNotes needs NotesProvider');
  return store;
}
