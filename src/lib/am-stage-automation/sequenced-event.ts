export async function createSequencedEvent<T>(input: {
  readNextSequence: () => Promise<number>;
  create: (sequence: number) => Promise<T>;
  isUniqueConflict: (error: unknown) => boolean;
  retries?: number;
}) {
  const retries = input.retries ?? 32;
  for (let attempt = 0; attempt < retries; attempt++) {
    const sequence = await input.readNextSequence();
    try {
      return await input.create(sequence);
    } catch (error) {
      if (!input.isUniqueConflict(error) || attempt === retries - 1) throw error;
    }
  }
  throw new Error("Unable to allocate an event sequence.");
}
