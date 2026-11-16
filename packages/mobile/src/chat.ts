export type Turn = {
  id: string;
  fromMe: boolean;
  text: string;
  detail?: string;
  image?: string;
};

let counter = 0;
export const turn = (t: Omit<Turn, 'id'>): Turn => ({ id: `t${++counter}`, ...t });

export function looksLikeQuestion(query: string) {
  const text = query.trim().toLowerCase();
  const first = text.split(' ')[0] ?? '';
  return text.endsWith('?') || ['who', 'who’s', "who's", 'what', 'what’s', 'when', 'where', 'why', 'how', 'is', 'are', 'does', 'do', 'should', 'can', 'will', 'did', 'tell', 'help', 'remind', 'give', 'find'].includes(first);
}

export const unavailableReply = (image?: string): Turn =>
  image
    ? turn({ fromMe: false, text: 'I can’t look at photos yet.', detail: 'Your photo stays on this phone.' })
    : turn({ fromMe: false, text: 'I can’t answer that yet.', detail: 'Ask isn’t connected to your conversations yet.' });
