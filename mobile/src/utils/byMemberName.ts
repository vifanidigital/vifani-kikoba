const collator = new Intl.Collator('sw', { sensitivity: 'base' });

export function byMemberName<T>(members: readonly T[], getName: (member: T) => string | null | undefined): T[] {
  return [...members].sort((left, right) => {
    const leftName = getName(left)?.trim();
    const rightName = getName(right)?.trim();
    if (!leftName || !rightName) return Number(!leftName) - Number(!rightName);
    return collator.compare(leftName, rightName);
  });
}
