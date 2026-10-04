// Only unwrap common spoken request prefixes, never instructions inside dictation.
export function browserCommandText(text: string): string {
  const source = text.trim();
  const prefix = /^(?:prosz[eę][,:]?|czy\s+mo[zż]esz(?:\s+mi)?|mo[zż]esz(?:\s+mi)?|chc[eę])\s+/iu;
  let command = source.replace(prefix, '');
  if (command !== source) {
    const verbs: Record<string, string> = { 'otworzyć': 'otwórz', 'wyszukać': 'wyszukaj', 'znaleźć': 'znajdź', 'wpisać': 'wpisz', 'wejść': 'wejdź', 'przejść': 'przejdź' };
    command = command.replace(/^(otworzyć|wyszukać|znaleźć|wpisać|wejść|przejść)(?=\s|$)/iu, verb => verbs[verb.toLocaleLowerCase('pl')]!);
  }
  return command
    .replace(/^(otw[oó]rz|przejd[zź]|wejd[zź]|id[zź]|wyszukaj|szukaj|poszukaj|wpisz|znajd[zź])(?:\s+mi)?(?:\s+prosz[eę])?[,:]?\s+/iu, '$1 ');
}
