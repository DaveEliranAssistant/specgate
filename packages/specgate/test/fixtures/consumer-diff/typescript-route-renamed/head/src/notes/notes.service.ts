export interface Note { id: string; tag: string }

const notes: Note[] = [];

export const listNotes = async (query: { tag?: string }): Promise<Note[]> =>
  notes.filter((note) => !query.tag || note.tag === query.tag);

export const getNote = async (id: string): Promise<Note | undefined> => notes.find((note) => note.id === id);
