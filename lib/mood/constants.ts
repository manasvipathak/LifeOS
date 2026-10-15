export const moodValues = ['very_happy', 'happy', 'neutral', 'sad', 'stressed'] as const;

export type MoodValue = (typeof moodValues)[number];

export const moodOptions: Array<{ value: MoodValue; label: string; emoji: string }> = [
  { value: 'very_happy', label: 'Very Happy', emoji: '😄' },
  { value: 'happy', label: 'Happy', emoji: '🙂' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'sad', label: 'Sad', emoji: '🙁' },
  { value: 'stressed', label: 'Stressed', emoji: '😣' },
];