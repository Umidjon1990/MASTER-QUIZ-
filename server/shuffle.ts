export function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function balancedShuffleOptions<T extends { options?: string[] | null; correctAnswer?: string | null }>(
  questions: T[]
): T[] {
  if (!questions.length) return questions;

  const withOptions = questions.filter(q => q.options && q.options.length >= 2 && q.correctAnswer);
  if (withOptions.length === 0) return questions;

  const maxSlots = Math.max(...withOptions.map(q => q.options!.length));
  const positionCounts = new Array(maxSlots).fill(0);

  const mcQuestions = questions.filter(q => q.options && q.options.length >= 2 && q.correctAnswer);
  const totalMC = mcQuestions.length;

  if (totalMC >= 4) {
    const idealPerSlot = Math.floor(totalMC / maxSlots);
    const assignments: number[] = [];
    const slots: number[] = [];
    for (let s = 0; s < maxSlots; s++) {
      for (let i = 0; i < idealPerSlot; i++) {
        slots.push(s);
      }
    }
    let remaining = totalMC - slots.length;
    const extraSlots: number[] = [];
    for (let s = 0; s < maxSlots && remaining > 0; s++) {
      extraSlots.push(s);
      remaining--;
    }
    const allSlots = fisherYatesShuffle([...slots, ...extraSlots]);

    let mcIdx = 0;
    return questions.map(q => {
      if (!q.options || q.options.length < 2 || !q.correctAnswer) return q;

      const opts = [...q.options];
      const correctIdx = opts.indexOf(q.correctAnswer!);
      if (correctIdx === -1) {
        return { ...q, options: fisherYatesShuffle(opts) };
      }

      const correct = opts.splice(correctIdx, 1)[0];
      const shuffledWrong = fisherYatesShuffle(opts);
      const targetPos = allSlots[mcIdx % allSlots.length];
      mcIdx++;

      const result = [...shuffledWrong];
      result.splice(Math.min(targetPos, result.length), 0, correct);

      return { ...q, options: result };
    });
  }

  return questions.map(q => {
    if (!q.options || q.options.length < 2 || !q.correctAnswer) return q;

    const opts = [...q.options];
    const correctIdx = opts.indexOf(q.correctAnswer!);
    if (correctIdx === -1) {
      return { ...q, options: fisherYatesShuffle(opts) };
    }

    const correct = opts.splice(correctIdx, 1)[0];
    const shuffledWrong = fisherYatesShuffle(opts);

    const numSlots = shuffledWrong.length + 1;
    const relevantCounts = positionCounts.slice(0, numSlots);
    const minCount = Math.min(...relevantCounts);
    const leastUsed = relevantCounts
      .map((c, i) => ({ count: c, index: i }))
      .filter(x => x.count === minCount)
      .map(x => x.index);
    const targetPos = leastUsed[Math.floor(Math.random() * leastUsed.length)];

    positionCounts[targetPos]++;

    const result = [...shuffledWrong];
    result.splice(targetPos, 0, correct);

    return { ...q, options: result };
  });
}
